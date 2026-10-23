// Package feedback is an opt-in private feedback service. It never reads the writing workspace.
package feedback

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	_ "embed"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	_ "github.com/jackc/pgx/v5/stdlib"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

//go:embed migrations/001_feedback.sql
var migration string

const MaxFileBytes = 4 << 20
const MaxFiles = 4
const MaxRequestBytes = 17 << 20

var opaque = regexp.MustCompile(`^[A-Za-z0-9_-]{32,100}$`)

type Config struct {
	Enabled              bool   `json:"enabled"`
	Development          bool   `json:"development"`
	Operator             string `json:"operator"`
	Purpose              string `json:"purpose"`
	AccessScope          string `json:"accessScope"`
	RetentionDays        int    `json:"retentionDays"`
	BackupRetentionDays  int    `json:"backupRetentionDays"`
	DeletionContact      string `json:"deletionContact"`
	NotificationsEnabled bool   `json:"notificationsEnabled"`
	AttachmentDir        string `json:"-"`
	AdminToken           string `json:"-"`
}

func (c Config) Ready() bool {
	return c.Enabled && c.RetentionDays > 0 && c.RetentionDays <= 365 && c.BackupRetentionDays >= 0 && c.Operator != "" && c.Purpose != "" && c.AccessScope != "" && c.DeletionContact != "" && len(c.AdminToken) >= 32 && c.AttachmentDir != ""
}

type Server struct {
	db      *sql.DB
	cfg     Config
	mu      sync.Mutex
	rates   map[string]rate
	filesMu sync.Mutex
	slots   chan struct{}
}
type rate struct {
	start time.Time
	count int
}
type Input struct {
	ClientRequestID string            `json:"clientRequestId"`
	AccessToken     string            `json:"accessToken,omitempty"`
	Description     string            `json:"description"`
	Role            string            `json:"role,omitempty"`
	Goal            string            `json:"goal,omitempty"`
	Impact          string            `json:"impact,omitempty"`
	Contact         string            `json:"contact,omitempty"`
	Notify          bool              `json:"notify,omitempty"`
	TechnicalInfo   map[string]string `json:"technicalInfo,omitempty"`
}
type Attachment struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	MediaType string `json:"mediaType"`
	Size      int64  `json:"size"`
	SHA256    string `json:"sha256"`
	data      []byte
}
type Message struct {
	ID          string    `json:"id"`
	Description string    `json:"description"`
	Author      string    `json:"author"`
	CreatedAt   time.Time `json:"createdAt"`
}
type Thread struct {
	ID            string            `json:"id"`
	Description   string            `json:"description"`
	Role          string            `json:"role"`
	Goal          string            `json:"goal"`
	Impact        string            `json:"impact"`
	Contact       string            `json:"contact"`
	Notify        bool              `json:"notify"`
	TechnicalInfo map[string]string `json:"technicalInfo"`
	Status        string            `json:"status"`
	Owner         string            `json:"owner"`
	FixVersion    string            `json:"fixVersion"`
	RelatedID     string            `json:"relatedId"`
	CreatedAt     time.Time         `json:"createdAt"`
	UpdatedAt     time.Time         `json:"updatedAt"`
	ExpiresAt     time.Time         `json:"expiresAt"`
	Messages      []Message         `json:"messages"`
	Attachments   []Attachment      `json:"attachments"`
}

func Open(ctx context.Context, dsn string, cfg Config) (*Server, error) {
	db, e := sql.Open("pgx", dsn)
	if e != nil {
		return nil, e
	}
	db.SetMaxOpenConns(8)
	db.SetConnMaxLifetime(10 * time.Minute)
	if e = db.PingContext(ctx); e != nil {
		db.Close()
		return nil, e
	}
	if _, e = db.ExecContext(ctx, migration); e != nil {
		db.Close()
		return nil, e
	}
	if cfg.AttachmentDir == "" {
		db.Close()
		return nil, errors.New("private attachment directory required")
	}
	cfg.AttachmentDir, e = filepath.Abs(cfg.AttachmentDir)
	if e != nil {
		db.Close()
		return nil, e
	}
	if e = os.MkdirAll(cfg.AttachmentDir, 0700); e != nil {
		db.Close()
		return nil, e
	}
	return &Server{db: db, cfg: cfg, rates: map[string]rate{}, slots: make(chan struct{}, 2)}, nil
}
func (s *Server) Close() error { return s.db.Close() }
func RandomToken() string {
	b := make([]byte, 32)
	if _, e := rand.Read(b); e != nil {
		panic(e)
	}
	return base64.RawURLEncoding.EncodeToString(b)
}
func digest(v string) []byte { h := sha256.Sum256([]byte(v)); return h[:] }
func token(r *http.Request) string {
	return strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
}
func (s *Server) admin(r *http.Request) bool {
	return len(s.cfg.AdminToken) >= 32 && subtle.ConstantTimeCompare(digest(token(r)), digest(s.cfg.AdminToken)) == 1
}
func output(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, status int, msg string) {
	output(w, status, map[string]string{"error": msg})
}
func (s *Server) authorized(ctx context.Context, id, t string, admin bool) bool {
	var h []byte
	var pending bool
	if s.db.QueryRowContext(ctx, "SELECT token_hash,deletion_pending FROM feedback_threads WHERE id=$1 AND expires_at>now()", id).Scan(&h, &pending) != nil {
		return false
	}
	return !pending && (admin || subtle.ConstantTimeCompare(h, digest(t)) == 1)
}
func (s *Server) allow(r *http.Request) bool {
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	h := hex.EncodeToString(digest(host))
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	for k, v := range s.rates {
		if now.Sub(v.start) > time.Minute {
			delete(s.rates, k)
		}
	}
	v := s.rates[h]
	if v.start.IsZero() {
		v.start = now
	}
	v.count++
	s.rates[h] = v
	return v.count <= 60
}
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "no-referrer")
	if r.URL.Path == "/api/feedback/config" && r.Method == "GET" {
		c := s.cfg
		c.NotificationsEnabled = false
		c.Enabled = c.Ready()
		output(w, 200, c)
		return
	}
	if !s.cfg.Ready() {
		fail(w, 503, "反馈收集尚未启用")
		return
	}
	if o := r.Header.Get("Origin"); o != "" {
		u, e := url.Parse(o)
		if e != nil || u.Host != r.Host || (u.Scheme != "http" && u.Scheme != "https") {
			fail(w, 403, "不接受跨站请求")
			return
		}
	}
	if !s.allow(r) {
		fail(w, 429, "操作过于频繁，请稍后再试")
		return
	}
	if s.slots != nil {
		select {
		case s.slots <- struct{}{}:
			defer func() { <-s.slots }()
		default:
			fail(w, 503, "当前接收繁忙，请保留填写稍后重试")
			return
		}
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	r = r.WithContext(ctx)
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/feedback/"), "/")
	parts := strings.Split(path, "/")
	admin := false
	if len(parts) > 0 && parts[0] == "admin" {
		admin = s.admin(r)
		if !admin {
			fail(w, 401, "需要处理人员凭据")
			return
		}
		parts = parts[1:]
	}
	if len(parts) == 0 || parts[0] != "threads" {
		fail(w, 404, "不存在")
		return
	}
	if len(parts) == 1 {
		if admin && r.Method == "GET" {
			s.list(w, r)
			return
		}
		if !admin && r.Method == "POST" {
			s.create(w, r)
			return
		}
		fail(w, 405, "不支持此操作")
		return
	}
	id := parts[1]
	if !s.authorized(ctx, id, token(r), admin) {
		fail(w, 404, "反馈不存在或凭据无效")
		return
	}
	switch {
	case len(parts) == 2 && r.Method == "GET":
		s.get(w, r, id)
	case len(parts) == 2 && r.Method == "DELETE":
		s.remove(w, r, id)
	case len(parts) == 2 && r.Method == "PATCH" && admin:
		s.update(w, r, id)
	case len(parts) == 3 && parts[2] == "messages" && r.Method == "POST":
		s.message(w, r, id, admin)
	case len(parts) == 4 && parts[2] == "attachments" && (r.Method == "GET" || r.Method == "DELETE"):
		s.attachment(w, r, id, parts[3])
	default:
		fail(w, 405, "不支持此操作")
	}
}
func readJSON(b []byte, v any) error {
	d := json.NewDecoder(bytes.NewReader(b))
	d.DisallowUnknownFields()
	if e := d.Decode(v); e != nil {
		return e
	}
	if d.Decode(&struct{}{}) != io.EOF {
		return errors.New("extra JSON")
	}
	return nil
}
func parse(w http.ResponseWriter, r *http.Request) (Input, []Attachment, error) {
	var in Input
	var fs []Attachment
	r.Body = http.MaxBytesReader(w, r.Body, MaxRequestBytes)
	if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		reader, e := r.MultipartReader()
		if e != nil {
			return in, nil, e
		}
		seen := false
		for {
			p, e := reader.NextPart()
			if e == io.EOF {
				break
			}
			if e != nil {
				return in, nil, e
			}
			limit := int64(MaxFileBytes)
			if p.FormName() == "payload" {
				limit = 64 << 10
			}
			b, e := io.ReadAll(io.LimitReader(p, limit+1))
			p.Close()
			if e != nil || int64(len(b)) > limit {
				return in, nil, errors.New("附件或文字过大")
			}
			if p.FormName() == "payload" && p.FileName() == "" && !seen {
				seen = true
				if e = readJSON(b, &in); e != nil {
					return in, nil, e
				}
			} else if p.FormName() == "files" && p.FileName() != "" {
				if len(fs) >= MaxFiles {
					return in, nil, errors.New("最多四个附件")
				}
				a, e := sanitizeAttachment(p.FileName(), b)
				if e != nil {
					return in, nil, e
				}
				fs = append(fs, a)
			} else {
				return in, nil, errors.New("未知上传字段")
			}
		}
		if !seen {
			return in, nil, errors.New("缺少payload")
		}
	} else {
		if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
			return in, nil, errors.New("需要JSON或multipart")
		}
		b, e := io.ReadAll(io.LimitReader(r.Body, 65537))
		if e != nil || len(b) > 65536 {
			return in, nil, errors.New("文字过大")
		}
		if e = readJSON(b, &in); e != nil {
			return in, nil, e
		}
	}
	if !opaque.MatchString(in.ClientRequestID) || len(strings.TrimSpace(in.Description)) == 0 || len([]rune(in.Description)) > 10000 {
		return in, nil, errors.New("描述必填，最多10000字；需要随机请求凭据")
	}
	for _, v := range []string{in.Role, in.Goal, in.Impact, in.Contact} {
		if len([]rune(v)) > 1000 {
			return in, nil, errors.New("选填内容过长")
		}
	}
	if in.AccessToken != "" && !opaque.MatchString(in.AccessToken) {
		return in, nil, errors.New("访问凭据无效")
	}
	if len(in.TechnicalInfo) > 6 {
		return in, nil, errors.New("技术信息过多")
	}
	for k, v := range in.TechnicalInfo {
		if k != "appVersion" && k != "browser" && k != "platform" && k != "errorCode" && k != "screenSize" && k != "engineVersion" {
			return in, nil, errors.New("不接受隐含技术数据")
		}
		if len(v) > 200 {
			return in, nil, errors.New("技术字段过长")
		}
	}
	return in, fs, nil
}
func payloadHash(in Input, fs []Attachment) []byte {
	in.AccessToken = ""
	fs = append([]Attachment(nil), fs...)
	sort.Slice(fs, func(i, j int) bool { return fs[i].MediaType+fs[i].SHA256 < fs[j].MediaType+fs[j].SHA256 })
	b, _ := json.Marshal(struct {
		Input Input
		Files []Attachment
	}{in, fs})
	return digest(string(b))
}
func (s *Server) writeFiles(fs []Attachment) error {
	for i := range fs {
		fs[i].ID = RandomToken()
		path := filepath.Join(s.cfg.AttachmentDir, fs[i].ID)
		f, e := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if e != nil {
			return e
		}
		_, e = f.Write(fs[i].data)
		if e == nil {
			e = f.Sync()
		}
		ce := f.Close()
		if e != nil {
			return e
		}
		if ce != nil {
			return ce
		}
	}
	return nil
}
func (s *Server) discard(fs []Attachment) {
	for _, a := range fs {
		if opaque.MatchString(a.ID) {
			os.Remove(filepath.Join(s.cfg.AttachmentDir, a.ID))
		}
	}
}
func insertFiles(ctx context.Context, tx *sql.Tx, id string, msg any, fs []Attachment) error {
	for _, a := range fs {
		_, e := tx.ExecContext(ctx, "INSERT INTO feedback_attachments(id,thread_id,message_id,name,media_type,size_bytes,sha256) VALUES($1,$2,$3,$4,$5,$6,$7)", a.ID, id, msg, a.Name, a.MediaType, a.Size, a.SHA256)
		if e != nil {
			return e
		}
	}
	return nil
}
func (s *Server) create(w http.ResponseWriter, r *http.Request) {
	in, fs, e := parse(w, r)
	if e != nil {
		fail(w, 400, e.Error())
		return
	}
	if in.Notify {
		fail(w, 400, "通知服务尚未启用，请取消通知后发送")
		return
	}
	if in.AccessToken == "" {
		in.AccessToken = RandomToken()
	}
	ph := payloadHash(in, fs)
	s.filesMu.Lock()
	defer s.filesMu.Unlock()
	var id string
	var th, old []byte
	var deleted bool
	status := "received"
	var receiptID sql.NullString
	e = s.db.QueryRowContext(r.Context(), "SELECT token_hash,thread_id,deleted FROM feedback_requests WHERE request_hash=$1", digest(in.ClientRequestID)).Scan(&th, &receiptID, &deleted)
	if e == nil {
		if subtle.ConstantTimeCompare(th, digest(in.AccessToken)) != 1 {
			fail(w, 409, "请求已使用；请使用原私密凭据核对")
			return
		}
		if deleted {
			fail(w, 410, "该反馈已删除，不会重新创建")
			return
		}
		id = receiptID.String
		e = s.db.QueryRowContext(r.Context(), "SELECT payload_hash,status FROM feedback_threads WHERE id=$1 AND NOT deletion_pending AND expires_at>now()", id).Scan(&old, &status)
		if e == sql.ErrNoRows {
			fail(w, 410, "反馈已到期或正在删除")
			return
		}
	}
	if e == nil {
		if subtle.ConstantTimeCompare(th, digest(in.AccessToken)) != 1 {
			fail(w, 409, "请求已使用；请使用原私密凭据核对")
			return
		}
		if subtle.ConstantTimeCompare(old, ph) != 1 {
			fail(w, 409, "该请求内容已变化，请核对原回执")
			return
		}
		output(w, 200, map[string]any{"id": id, "accessToken": in.AccessToken, "status": status, "replayed": true})
		return
	}
	if e != sql.ErrNoRows {
		fail(w, 503, "接收暂不可用，保留填写后重试")
		return
	}
	if e = s.writeFiles(fs); e != nil {
		s.discard(fs)
		fail(w, 503, "附件未保存，反馈未提交")
		return
	}
	committing := false
	defer func() {
		if e != nil && !committing {
			s.discard(fs)
		}
	}()
	tx, e := s.db.BeginTx(r.Context(), nil)
	if e != nil {
		fail(w, 503, "接收暂不可用")
		return
	}
	defer tx.Rollback()
	id = RandomToken()
	tech, _ := json.Marshal(in.TechnicalInfo)
	if in.TechnicalInfo == nil {
		tech = []byte("{}")
	}
	_, e = tx.ExecContext(r.Context(), "INSERT INTO feedback_threads(id,request_id,token_hash,payload_hash,description,role,goal,impact,contact,notify,technical_info,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()+($12*interval '1 day'))", id, in.ClientRequestID, digest(in.AccessToken), ph, in.Description, in.Role, in.Goal, in.Impact, in.Contact, in.Notify, tech, s.cfg.RetentionDays)
	if e == nil {
		_, e = tx.ExecContext(r.Context(), "INSERT INTO feedback_requests(request_hash,token_hash,thread_id,expires_at) VALUES($1,$2,$3,now()+($4*interval '1 day'))", digest(in.ClientRequestID), digest(in.AccessToken), id, s.cfg.RetentionDays+1)
	}
	if e == nil {
		e = insertFiles(r.Context(), tx, id, nil, fs)
	}
	if e == nil {
		_, e = tx.ExecContext(r.Context(), "INSERT INTO feedback_events(thread_id,action,actor) VALUES($1,'received','user')", id)
	}
	if e == nil {
		committing = true
		e = tx.Commit()
	}
	if e != nil {
		fail(w, 503, "接收结果待核对，请保留本次请求与私密凭据后重试")
		return
	}
	output(w, 201, map[string]string{"id": id, "accessToken": in.AccessToken, "status": "received"})
}
func (s *Server) get(w http.ResponseWriter, r *http.Request, id string) {
	t, e := s.load(r.Context(), id)
	if e != nil {
		fail(w, 503, "读取暂不可用")
		return
	}
	actor := "user"
	if s.admin(r) {
		actor = "handler"
	}
	if _, e = s.db.ExecContext(r.Context(), "INSERT INTO feedback_events(thread_id,action,actor) VALUES($1,'read',$2)", id, actor); e != nil {
		fail(w, 503, "访问记录暂不可用")
		return
	}
	output(w, 200, t)
}
func (s *Server) load(ctx context.Context, id string) (Thread, error) {
	t := Thread{Messages: []Message{}, Attachments: []Attachment{}}
	var tech []byte
	e := s.db.QueryRowContext(ctx, "SELECT id,description,role,goal,impact,contact,notify,technical_info,status,owner_name,fix_version,related_id,created_at,updated_at,expires_at FROM feedback_threads WHERE id=$1 AND NOT deletion_pending", id).Scan(&t.ID, &t.Description, &t.Role, &t.Goal, &t.Impact, &t.Contact, &t.Notify, &tech, &t.Status, &t.Owner, &t.FixVersion, &t.RelatedID, &t.CreatedAt, &t.UpdatedAt, &t.ExpiresAt)
	if e != nil {
		return t, e
	}
	json.Unmarshal(tech, &t.TechnicalInfo)
	rows, e := s.db.QueryContext(ctx, "SELECT id,description,author,created_at FROM feedback_messages WHERE thread_id=$1 ORDER BY created_at,id", id)
	if e != nil {
		return t, e
	}
	for rows.Next() {
		var m Message
		if e = rows.Scan(&m.ID, &m.Description, &m.Author, &m.CreatedAt); e != nil {
			rows.Close()
			return t, e
		}
		t.Messages = append(t.Messages, m)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return t, e
	}
	rows, e = s.db.QueryContext(ctx, "SELECT id,name,media_type,size_bytes,sha256 FROM feedback_attachments WHERE thread_id=$1 AND NOT deletion_pending ORDER BY created_at,id", id)
	if e != nil {
		return t, e
	}
	defer rows.Close()
	for rows.Next() {
		var a Attachment
		if e = rows.Scan(&a.ID, &a.Name, &a.MediaType, &a.Size, &a.SHA256); e != nil {
			return t, e
		}
		t.Attachments = append(t.Attachments, a)
	}
	return t, rows.Err()
}
func (s *Server) message(w http.ResponseWriter, r *http.Request, id string, admin bool) {
	in, fs, e := parse(w, r)
	if e != nil {
		fail(w, 400, e.Error())
		return
	}
	if in.Role != "" || in.Goal != "" || in.Impact != "" || in.Contact != "" || in.Notify || len(in.TechnicalInfo) > 0 || in.AccessToken != "" {
		fail(w, 400, "补充仅接受说明和主动选择的附件")
		return
	}
	ph := payloadHash(in, fs)
	s.filesMu.Lock()
	defer s.filesMu.Unlock()
	author := "user"
	if admin {
		author = "handler"
	}
	var mid string
	var old []byte
	var oldAuthor string
	e = s.db.QueryRowContext(r.Context(), "SELECT id,payload_hash,author FROM feedback_messages WHERE thread_id=$1 AND request_id=$2", id, in.ClientRequestID).Scan(&mid, &old, &oldAuthor)
	if e == nil {
		if subtle.ConstantTimeCompare(old, ph) != 1 || oldAuthor != author {
			fail(w, 409, "该请求已用于其他补充")
			return
		}
		output(w, 200, map[string]any{"id": mid, "replayed": true})
		return
	}
	if e != sql.ErrNoRows {
		fail(w, 503, "补充暂不可用")
		return
	}
	var count int
	if s.db.QueryRowContext(r.Context(), "SELECT count(*) FROM feedback_messages WHERE thread_id=$1", id).Scan(&count) != nil || count >= 100 {
		fail(w, 400, "每条反馈最多100次补充与回复")
		return
	}
	var n int
	if s.db.QueryRowContext(r.Context(), "SELECT count(*) FROM feedback_attachments WHERE thread_id=$1", id).Scan(&n) != nil || n+len(fs) > 12 {
		fail(w, 400, "每条反馈最多十二个附件")
		return
	}
	if e = s.writeFiles(fs); e != nil {
		s.discard(fs)
		fail(w, 503, "附件保存失败")
		return
	}
	committing := false
	defer func() {
		if e != nil && !committing {
			s.discard(fs)
		}
	}()
	tx, e := s.db.BeginTx(r.Context(), nil)
	if e != nil {
		fail(w, 503, "补充失败")
		return
	}
	defer tx.Rollback()
	mid = RandomToken()
	_, e = tx.ExecContext(r.Context(), "INSERT INTO feedback_messages(id,thread_id,request_id,payload_hash,author,description) VALUES($1,$2,$3,$4,$5,$6)", mid, id, in.ClientRequestID, ph, author, in.Description)
	if e == nil {
		e = insertFiles(r.Context(), tx, id, mid, fs)
	}
	if e == nil {
		_, e = tx.ExecContext(r.Context(), "UPDATE feedback_threads SET updated_at=now() WHERE id=$1", id)
	}
	if e == nil {
		_, e = tx.ExecContext(r.Context(), "INSERT INTO feedback_events(thread_id,action,actor) VALUES($1,'message',$2)", id, author)
	}
	if e == nil {
		committing = true
		e = tx.Commit()
	}
	if e != nil {
		fail(w, 503, "补充结果待核对，请使用相同请求重试")
		return
	}
	output(w, 201, map[string]string{"id": mid})
}
func (s *Server) list(w http.ResponseWriter, r *http.Request) {
	offset := 0
	if raw := r.URL.Query().Get("offset"); raw != "" {
		var e error
		offset, e = strconv.Atoi(raw)
		if e != nil || offset < 0 || offset > 100000 {
			fail(w, 400, "无效分页位置")
			return
		}
	}
	rows, e := s.db.QueryContext(r.Context(), "SELECT id,left(description,100),status,role,goal,impact,owner_name,fix_version,created_at,updated_at FROM feedback_threads WHERE NOT deletion_pending AND expires_at>now() ORDER BY updated_at DESC,id LIMIT 100 OFFSET $1", offset)
	if e != nil {
		fail(w, 503, "读取失败")
		return
	}
	defer rows.Close()
	out := []Thread{}
	for rows.Next() {
		var t Thread
		if rows.Scan(&t.ID, &t.Description, &t.Status, &t.Role, &t.Goal, &t.Impact, &t.Owner, &t.FixVersion, &t.CreatedAt, &t.UpdatedAt) != nil {
			fail(w, 503, "读取失败")
			return
		}
		out = append(out, t)
	}
	if rows.Err() != nil {
		fail(w, 503, "读取失败")
		return
	}
	result := map[string]any{"threads": out}
	if len(out) == 100 {
		result["nextOffset"] = offset + 100
	}
	output(w, 200, result)
}
func (s *Server) update(w http.ResponseWriter, r *http.Request, id string) {
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	b, e := io.ReadAll(r.Body)
	var p struct {
		Status     string `json:"status"`
		Owner      string `json:"owner"`
		FixVersion string `json:"fixVersion"`
		RelatedID  string `json:"relatedId"`
	}
	if e != nil || readJSON(b, &p) != nil {
		fail(w, 400, "无效处理信息")
		return
	}
	switch p.Status {
	case "received", "needs_information", "in_progress", "resolved", "unsupported":
	default:
		fail(w, 400, "未知状态")
		return
	}
	if len(p.Owner) > 200 || len(p.FixVersion) > 200 || len(p.RelatedID) > 100 {
		fail(w, 400, "处理信息过长")
		return
	}
	_, e = s.db.ExecContext(r.Context(), "WITH changed AS (UPDATE feedback_threads SET status=$2,owner_name=$3,fix_version=$4,related_id=$5,updated_at=now() WHERE id=$1 RETURNING id) INSERT INTO feedback_events(thread_id,action,actor) SELECT id,'status','handler' FROM changed", id, p.Status, p.Owner, p.FixVersion, p.RelatedID)
	if e != nil {
		fail(w, 503, "更新失败")
		return
	}
	output(w, 200, map[string]string{"status": p.Status})
}
func (s *Server) remove(w http.ResponseWriter, r *http.Request, id string) {
	s.filesMu.Lock()
	defer s.filesMu.Unlock()
	if _, e := s.db.ExecContext(r.Context(), "UPDATE feedback_threads SET deletion_pending=true WHERE id=$1", id); e != nil {
		fail(w, 503, "删除未完成")
		return
	}
	if e := s.purge(r.Context(), id); e != nil {
		fail(w, 503, "已停止访问，删除尚在清理，请稍后核对")
		return
	}
	output(w, 200, map[string]string{"status": "deleted"})
}
func (s *Server) purge(ctx context.Context, id string) error {
	rows, e := s.db.QueryContext(ctx, "SELECT id FROM feedback_attachments WHERE thread_id=$1", id)
	if e != nil {
		return e
	}
	var ids []string
	for rows.Next() {
		var a string
		if e = rows.Scan(&a); e != nil {
			rows.Close()
			return e
		}
		ids = append(ids, a)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return e
	}
	for _, a := range ids {
		if !opaque.MatchString(a) {
			return errors.New("invalid stored attachment ID")
		}
		e = os.Remove(filepath.Join(s.cfg.AttachmentDir, a))
		if e != nil && !os.IsNotExist(e) {
			return e
		}
	}
	tx, e := s.db.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	if _, e = tx.ExecContext(ctx, "UPDATE feedback_requests SET deleted=true,thread_id=NULL WHERE thread_id=$1", id); e != nil {
		return e
	}
	if _, e = tx.ExecContext(ctx, "DELETE FROM feedback_threads WHERE id=$1", id); e != nil {
		return e
	}
	return tx.Commit()
}
func (s *Server) attachment(w http.ResponseWriter, r *http.Request, id, a string) {
	if !opaque.MatchString(a) {
		fail(w, 404, "附件不存在")
		return
	}
	s.filesMu.Lock()
	defer s.filesMu.Unlock()
	var media string
	var pending bool
	e := s.db.QueryRowContext(r.Context(), "SELECT media_type,deletion_pending FROM feedback_attachments WHERE id=$1 AND thread_id=$2", a, id).Scan(&media, &pending)
	if e != nil || pending {
		fail(w, 404, "附件不存在")
		return
	}
	path := filepath.Join(s.cfg.AttachmentDir, a)
	if r.Method == "DELETE" {
		if _, e = s.db.ExecContext(r.Context(), "UPDATE feedback_attachments SET deletion_pending=true WHERE id=$1", a); e == nil {
			e = os.Remove(path)
			if os.IsNotExist(e) {
				e = nil
			}
		}
		if e == nil {
			_, e = s.db.ExecContext(r.Context(), "DELETE FROM feedback_attachments WHERE id=$1", a)
		}
		if e != nil {
			fail(w, 503, "附件删除尚未完成")
			return
		}
		output(w, 200, map[string]string{"status": "deleted"})
		return
	}
	actor := "user"
	if s.admin(r) {
		actor = "handler"
	}
	if _, e = s.db.ExecContext(r.Context(), "INSERT INTO feedback_events(thread_id,action,actor) VALUES($1,'attachment_read',$2)", id, actor); e != nil {
		fail(w, 503, "访问记录暂不可用")
		return
	}
	b, e := os.ReadFile(path)
	if e != nil {
		fail(w, 404, "附件不可读取")
		return
	}
	w.Header().Set("Content-Type", media)
	w.Header().Set("Content-Disposition", `attachment; filename="feedback-evidence`+map[string]string{"image/png": ".png", "application/json": ".json"}[media]+`"`)
	w.Write(b)
}

// Sweep removes expired threads, pending deletions and old unreferenced files. It does not claim external backup erasure.
func (s *Server) Sweep(ctx context.Context) error {
	s.filesMu.Lock()
	defer s.filesMu.Unlock()
	rows, e := s.db.QueryContext(ctx, "SELECT id FROM feedback_threads WHERE deletion_pending OR expires_at<=now()")
	if e != nil {
		return e
	}
	var ids []string
	for rows.Next() {
		var id string
		if e = rows.Scan(&id); e != nil {
			rows.Close()
			return e
		}
		ids = append(ids, id)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return e
	}
	for _, id := range ids {
		if _, e = s.db.ExecContext(ctx, "UPDATE feedback_threads SET deletion_pending=true WHERE id=$1", id); e != nil {
			return e
		}
		if e = s.purge(ctx, id); e != nil {
			return e
		}
	}
	rows, e = s.db.QueryContext(ctx, "SELECT id FROM feedback_attachments WHERE deletion_pending")
	if e != nil {
		return e
	}
	ids = nil
	for rows.Next() {
		var id string
		if e = rows.Scan(&id); e != nil {
			rows.Close()
			return e
		}
		ids = append(ids, id)
	}
	rows.Close()
	for _, id := range ids {
		e = os.Remove(filepath.Join(s.cfg.AttachmentDir, id))
		if e != nil && !os.IsNotExist(e) {
			return e
		}
		if _, e = s.db.ExecContext(ctx, "DELETE FROM feedback_attachments WHERE id=$1", id); e != nil {
			return e
		}
	}
	if _, e = s.db.ExecContext(ctx, "DELETE FROM feedback_requests WHERE expires_at<=now() AND deleted"); e != nil {
		return e
	}
	entries, e := os.ReadDir(s.cfg.AttachmentDir)
	if e != nil {
		return e
	}
	for _, entry := range entries {
		if !opaque.MatchString(entry.Name()) || entry.IsDir() {
			continue
		}
		info, e := entry.Info()
		if e != nil {
			return e
		}
		if time.Since(info.ModTime()) < time.Hour {
			continue
		}
		var exists bool
		if e = s.db.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM feedback_attachments WHERE id=$1)", entry.Name()).Scan(&exists); e != nil {
			return e
		}
		if !exists {
			if e = os.Remove(filepath.Join(s.cfg.AttachmentDir, entry.Name())); e != nil {
				return e
			}
		}
	}
	return nil
}
func (s *Server) String() string {
	return fmt.Sprintf("feedback(development=%t,enabled=%t)", s.cfg.Development, s.cfg.Ready())
}
