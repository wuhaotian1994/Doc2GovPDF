package feedback

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"io"
	"mime/multipart"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

func fixturePNG() []byte {
	im := image.NewRGBA(image.Rect(0, 0, 12, 12))
	im.Set(0, 0, color.RGBA{R: 255, A: 255})
	var b bytes.Buffer
	png.Encode(&b, im)
	return b.Bytes()
}
func TestAttachments(t *testing.T) {
	good := []byte(`{"version":1,"kind":"doc2govpdf-feedback-example","title":"虚构回执","blocks":[{"type":"paragraph","text":"虚构文字"},{"type":"table","rows":[["项目","数量"],["示例","2"]]}]}`)
	for _, v := range []struct {
		name string
		b    []byte
		ok   bool
	}{{"pixel.png", fixturePNG(), true}, {"example.json", good, true}, {"word.docx", []byte("PK\x03\x04"), false}, {"x.json", []byte(`{"version":1,"kind":"doc2govpdf-feedback-example","blocks":[{"type":"paragraph","text":"x","hidden":"secret"}]}`), false}, {"x.json", []byte(`{"version":1,"kind":"doc2govpdf-feedback-example","blocks":[{"type":"table","rows":[["1","2"],["3"]]}]}`), false}, {"x.png", []byte("bad"), false}, {"x.png", make([]byte, MaxFileBytes+1), false}} {
		t.Run(v.name+strconv.Itoa(len(v.b)%100), func(t *testing.T) {
			a, e := sanitizeAttachment(v.name, v.b)
			if (e == nil) != v.ok {
				t.Fatalf("accepted=%t expected=%t", e == nil, v.ok)
			}
			if v.ok && len(a.data) == 0 {
				t.Fatal("missing canonical evidence")
			}
		})
	}
	// Data after IEND (including hidden source bytes) is not retained by re-encoding.
	dirty := append(fixturePNG(), []byte("HIDDEN ORIGINAL SOURCE")...)
	a, e := sanitizeAttachment("image.png", dirty)
	if e != nil || bytes.Contains(a.data, []byte("HIDDEN")) {
		t.Fatal("PNG metadata/trailing bytes retained")
	}
}
func TestConfigFailClosed(t *testing.T) {
	s := &Server{}
	r := httptest.NewRequest("GET", "/api/feedback/config", nil)
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"enabled":false`) {
		t.Fatal(w.Body.String())
	}
	w = httptest.NewRecorder()
	s.ServeHTTP(w, httptest.NewRequest("POST", "/api/feedback/threads", strings.NewReader("{}")))
	if w.Code != 503 {
		t.Fatal("unconfigured collection accepted")
	}
}
func TestPostgresLifecycle(t *testing.T) {
	dsn := os.Getenv("FEEDBACK_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set FEEDBACK_TEST_DATABASE_URL for real PostgreSQL integration")
	}
	parsedDSN, parseErr := url.Parse(dsn)
	if parseErr != nil || !strings.HasSuffix(parsedDSN.Path, "_test") {
		t.Fatal("integration DSN must explicitly name a dedicated *_test database before migrations run")
	}
	cfg := Config{Enabled: true, Development: true, Operator: "虚构本机测试", Purpose: "虚构反馈闭环", AccessScope: "本机测试", RetentionDays: 1, BackupRetentionDays: 0, DeletionContact: "私密回执删除", AttachmentDir: t.TempDir(), AdminToken: RandomToken()}
	ctx := context.Background()
	s, e := Open(ctx, dsn, cfg)
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	var database string
	if s.db.QueryRow("SELECT current_database()").Scan(&database) != nil || !strings.HasSuffix(database, "_test") {
		t.Fatal("integration requires dedicated *_test database")
	}
	if _, e = s.db.Exec("TRUNCATE feedback_requests,feedback_attachments,feedback_messages,feedback_threads CASCADE"); e != nil {
		t.Fatal(e)
	}
	seq := 0
	call := func(method, path, bearer string, in any, files map[string][]byte) *httptest.ResponseRecorder {
		t.Helper()
		var body io.Reader
		ct := "application/json"
		if files != nil {
			var b bytes.Buffer
			mw := multipart.NewWriter(&b)
			p, _ := mw.CreateFormField("payload")
			json.NewEncoder(p).Encode(in)
			for name, data := range files {
				f, _ := mw.CreateFormFile("files", name)
				f.Write(data)
			}
			mw.Close()
			body = &b
			ct = mw.FormDataContentType()
		} else if in != nil {
			b, _ := json.Marshal(in)
			body = bytes.NewReader(b)
		}
		r := httptest.NewRequest(method, path, body)
		r.Header.Set("Content-Type", ct)
		if bearer != "" {
			r.Header.Set("Authorization", "Bearer "+bearer)
		}
		seq++
		r.RemoteAddr = "127.0.0." + string(rune('a'+seq)) + ":1"
		w := httptest.NewRecorder()
		s.ServeHTTP(w, r)
		return w
	}
	expect := func(w *httptest.ResponseRecorder, status int) {
		t.Helper()
		if w.Code != status {
			t.Fatalf("status %d expected %d: %s", w.Code, status, w.Body.String())
		}
	}
	in := Input{ClientRequestID: RandomToken(), AccessToken: RandomToken(), Description: "虚构学校办公室：回执表跨页", Role: "学校办公室", Goal: "保留表格结构", Impact: "需人工整理", TechnicalInfo: map[string]string{"appVersion": "test"}}
	w := call("POST", "/api/feedback/threads", "", in, map[string][]byte{"crop.png": fixturePNG(), "example.json": []byte(`{"version":1,"kind":"doc2govpdf-feedback-example","blocks":[{"type":"paragraph","text":"虚构示例"}]}`)})
	expect(w, 201)
	var receipt struct{ ID, AccessToken, Status string }
	json.Unmarshal(w.Body.Bytes(), &receipt)
	if receipt.ID == "" || receipt.AccessToken != in.AccessToken {
		t.Fatal("private receipt missing")
	}
	var stored []byte
	if s.db.QueryRow("SELECT token_hash FROM feedback_threads WHERE id=$1", receipt.ID).Scan(&stored) != nil || bytes.Equal(stored, []byte(in.AccessToken)) {
		t.Fatal("raw credential stored")
	}
	want := sha256.Sum256([]byte(in.AccessToken))
	if !bytes.Equal(stored, want[:]) {
		t.Fatal("token hash mismatch")
	}
	files := map[string][]byte{"crop.png": fixturePNG(), "example.json": []byte(`{"version":1,"kind":"doc2govpdf-feedback-example","blocks":[{"type":"paragraph","text":"虚构示例"}]}`)}
	// Multipart order is deliberately nondeterministic in this test helper; canonicalization must sort it.
	expect(call("POST", "/api/feedback/threads", "", in, files), 200)
	stolen := in
	stolen.AccessToken = RandomToken()
	expect(call("POST", "/api/feedback/threads", "", stolen, files), 409)
	changed := in
	changed.Description += "变更"
	expect(call("POST", "/api/feedback/threads", "", changed, files), 409)
	path := "/api/feedback/threads/" + receipt.ID
	expect(call("GET", path, "", nil, nil), 404)
	expect(call("GET", path, RandomToken(), nil, nil), 404)
	w = call("GET", path, in.AccessToken, nil, nil)
	expect(w, 200)
	var thread Thread
	json.Unmarshal(w.Body.Bytes(), &thread)
	if len(thread.Attachments) != 2 || thread.Description != in.Description {
		t.Fatal("canonical feedback lost")
	}
	a := thread.Attachments[0]
	expect(call("GET", path+"/attachments/"+a.ID, "", nil, nil), 404)
	w = call("GET", path+"/attachments/"+a.ID, in.AccessToken, nil, nil)
	expect(w, 200)
	if w.Header().Get("Content-Type") != a.MediaType {
		t.Fatal("attachment media mismatch")
	}
	msg := Input{ClientRequestID: RandomToken(), Description: "虚构补充：需要保留空白填写栏"}
	expect(call("POST", path+"/messages", in.AccessToken, msg, nil), 201)
	expect(call("POST", path+"/messages", in.AccessToken, msg, nil), 200)
	expect(call("GET", "/api/feedback/admin/threads", "", nil, nil), 401)
	expect(call("GET", "/api/feedback/admin/threads", cfg.AdminToken, nil, nil), 200)
	expect(call("PATCH", "/api/feedback/admin/threads/"+receipt.ID, cfg.AdminToken, map[string]string{"status": "in_progress", "owner": "模拟处理岗", "fixVersion": "test-1"}, nil), 200)
	reply := Input{ClientRequestID: RandomToken(), Description: "已复现虚构示例，正在调整表格关系"}
	expect(call("POST", "/api/feedback/admin/threads/"+receipt.ID+"/messages", cfg.AdminToken, reply, nil), 201)
	w = call("GET", path, in.AccessToken, nil, nil)
	expect(w, 200)
	json.Unmarshal(w.Body.Bytes(), &thread)
	if thread.Status != "in_progress" || thread.Owner != "模拟处理岗" || thread.FixVersion != "test-1" || len(thread.Messages) != 2 || thread.Messages[1].Author != "handler" {
		t.Fatal("handling lifecycle missing")
	}
	expect(call("DELETE", path+"/attachments/"+a.ID, in.AccessToken, nil, nil), 200)
	if _, e = os.Stat(filepath.Join(cfg.AttachmentDir, a.ID)); !os.IsNotExist(e) {
		t.Fatal("attachment not physically removed")
	}
	expect(call("DELETE", path, in.AccessToken, nil, nil), 200)
	expect(call("GET", path, in.AccessToken, nil, nil), 404)
	expect(call("POST", "/api/feedback/threads", "", in, files), 410)
	for _, table := range []string{"feedback_threads", "feedback_messages", "feedback_attachments"} {
		var n int
		s.db.QueryRow("SELECT count(*) FROM " + table).Scan(&n)
		if n != 0 {
			t.Fatalf("%s not erased", table)
		}
	}
	entries, _ := os.ReadDir(cfg.AttachmentDir)
	if len(entries) != 0 {
		t.Fatal("private files remain")
	}
	// Expiration and orphan cleanup are actual SQL/file operations, not interface hiding.
	expire := Input{ClientRequestID: RandomToken(), AccessToken: RandomToken(), Description: "虚构到期材料"}
	w = call("POST", "/api/feedback/threads", "", expire, map[string][]byte{"one.png": fixturePNG()})
	expect(w, 201)
	s.db.Exec("UPDATE feedback_threads SET expires_at=now()-interval '1 minute'")
	orphan := filepath.Join(cfg.AttachmentDir, RandomToken())
	os.WriteFile(orphan, []byte("orphan"), 0600)
	past := time.Now().Add(-2 * time.Hour)
	os.Chtimes(orphan, past, past)
	if e = s.Sweep(ctx); e != nil {
		t.Fatal(e)
	}
	entries, _ = os.ReadDir(cfg.AttachmentDir)
	if len(entries) != 0 {
		t.Fatal("retention failed")
	}
	// A second independent PostgreSQL connection verifies durable persistence.
	input := Input{ClientRequestID: RandomToken(), AccessToken: RandomToken(), Description: strings.Repeat("虚构自然说明，", 20), Contact: "虚构私密联系方式不进入列表", TechnicalInfo: map[string]string{"appVersion": "private-technical-marker"}}
	w = call("POST", "/api/feedback/threads", "", input, nil)
	expect(w, 201)
	json.Unmarshal(w.Body.Bytes(), &receipt)
	second, e := Open(ctx, dsn, cfg)
	if e != nil {
		t.Fatal(e)
	}
	loaded, e := second.load(ctx, receipt.ID)
	second.Close()
	if e != nil || loaded.Description != input.Description {
		t.Fatal("not durable across connections")
	}
	w = call("GET", "/api/feedback/admin/threads", cfg.AdminToken, nil, nil)
	expect(w, 200)
	var summaries struct {
		Threads []Thread `json:"threads"`
	}
	if json.Unmarshal(w.Body.Bytes(), &summaries) != nil || len(summaries.Threads) != 1 {
		t.Fatal("admin summary list missing")
	}
	summary := summaries.Threads[0]
	if summary.ID != receipt.ID || summary.Description != string([]rune(input.Description)[:100]) || summary.Status != "received" || summary.Role != "" || summary.Goal != "" || summary.Contact != "" || summary.TechnicalInfo != nil {
		t.Fatal("no-role feedback needs a bounded description summary without private contact or technical fields")
	}
	if strings.Contains(w.Body.String(), input.Contact) || strings.Contains(w.Body.String(), "private-technical-marker") || len([]rune(loaded.Description)) <= 100 {
		t.Fatal("list must be bounded while the authorized detail keeps the full description")
	}
	t.Log("PostgreSQL: no-role natural-description list summary is bounded to 100 characters; details remain complete")
	var wg sync.WaitGroup
	statuses := make(chan int, 5)
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			b, _ := json.Marshal(input)
			r := httptest.NewRequest("POST", "/api/feedback/threads", bytes.NewReader(b))
			r.Header.Set("Content-Type", "application/json")
			r.RemoteAddr = "127.0.0.1:1"
			w := httptest.NewRecorder()
			s.ServeHTTP(w, r)
			statuses <- w.Code
		}()
	}
	wg.Wait()
	close(statuses)

	for status := range statuses {
		if status != 200 && status != 503 {
			t.Fatalf("unexpected concurrent replay status %d", status)
		}
	}
	// Busy requests do not imply acceptance; the same private request retries safely after backpressure.
	expect(call("POST", "/api/feedback/threads", "", input, nil), 200)
	var totalThreads int
	if s.db.QueryRow("SELECT count(*) FROM feedback_threads").Scan(&totalThreads) != nil || totalThreads != 1 {
		t.Fatal("concurrent retry created duplicate feedback")
	}

	t.Log("PostgreSQL: create/private authorization/idempotent replay/supplement/handler reply+status+version/attachment authentication+physical deletion/whole physical deletion/tombstone/expiry+orphan cleanup/durable reload/concurrent replay passed")
}

func TestTransparentPixelsFlattened(t *testing.T) {
	im := image.NewNRGBA(image.Rect(0, 0, 2, 1))
	im.SetNRGBA(0, 0, color.NRGBA{R: 211, G: 72, B: 54, A: 0})
	im.SetNRGBA(1, 0, color.NRGBA{R: 255, G: 0, B: 0, A: 128})
	var raw bytes.Buffer
	png.Encode(&raw, im)
	a, e := sanitizeAttachment("redacted.png", raw.Bytes())
	if e != nil {
		t.Fatal(e)
	}
	decoded, e := png.Decode(bytes.NewReader(a.data))
	if e != nil {
		t.Fatal(e)
	}
	r, g, b, alpha := decoded.At(0, 0).RGBA()
	if r != 65535 || g != 65535 || b != 65535 || alpha != 65535 {
		t.Fatal("transparent hidden original RGB retained")
	}
	_, _, _, alpha = decoded.At(1, 0).RGBA()
	if alpha != 65535 {
		t.Fatal("partial transparency retained")
	}
}
