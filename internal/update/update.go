// Package update verifies signed release metadata and stages installer payloads.
package update

import (
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type Manifest struct {
	Version   string `json:"version"`
	URL       string `json:"url"`
	SHA256    string `json:"sha256"`
	Size      int64  `json:"size"`
	Signature string `json:"signature"`
}
type Client struct {
	HTTP           *http.Client
	PublicKey      ed25519.PublicKey
	CurrentVersion string
	ManifestURL    string
}

var versionPattern = regexp.MustCompile(`^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$`)

func Compare(a, b string) (int, error) {
	if !versionPattern.MatchString(a) || !versionPattern.MatchString(b) {
		return 0, fmt.Errorf("版本号无效")
	}
	aa := strings.Split(a, ".")
	bb := strings.Split(b, ".")
	for i := 0; i < 3; i++ {
		x, e := strconv.ParseUint(aa[i], 10, 32)
		if e != nil {
			return 0, e
		}
		y, e := strconv.ParseUint(bb[i], 10, 32)
		if e != nil {
			return 0, e
		}
		if x < y {
			return -1, nil
		}
		if x > y {
			return 1, nil
		}
	}
	return 0, nil
}
func (m Manifest) SignedBytes() []byte {
	return []byte(fmt.Sprintf("Doc2GovPDF-update-v1\n%s\n%s\n%s\n%d\n", m.Version, m.URL, m.SHA256, m.Size))
}
func validateURL(raw string) error {
	u, e := url.Parse(raw)
	if e != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.Fragment != "" {
		return fmt.Errorf("更新必须来自 HTTPS 地址")
	}
	return nil
}
func (c Client) Verify(m Manifest) error {
	if len(c.PublicKey) != ed25519.PublicKeySize {
		return fmt.Errorf("尚未配置可信更新公钥")
	}
	if e := validateURL(m.URL); e != nil {
		return e
	}
	if m.Size <= 0 || m.Size > 512*1024*1024 {
		return fmt.Errorf("更新包大小超出范围")
	}
	hash, e := hex.DecodeString(m.SHA256)
	if e != nil || len(hash) != 32 || strings.ToLower(m.SHA256) != m.SHA256 {
		return fmt.Errorf("更新摘要格式无效")
	}
	if _, e = Compare(m.Version, c.CurrentVersion); e != nil {
		return e
	}
	sig, e := base64.StdEncoding.DecodeString(m.Signature)
	if e != nil || !ed25519.Verify(c.PublicKey, m.SignedBytes(), sig) {
		return fmt.Errorf("更新签名无效，保留当前版本")
	}
	return nil
}
func (c Client) client() *http.Client {
	if c.HTTP != nil {
		return c.HTTP
	}
	return &http.Client{Timeout: 120 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) > 5 {
			return fmt.Errorf("更新重定向过多")
		}
		return validateURL(req.URL.String())
	}}
}
func (c Client) Check(ctx context.Context) (*Manifest, error) {
	if c.ManifestURL == "" {
		return nil, fmt.Errorf("更新发布地址尚未配置")
	}
	if e := validateURL(c.ManifestURL); e != nil {
		return nil, e
	}
	req, e := http.NewRequestWithContext(ctx, http.MethodGet, c.ManifestURL, nil)
	if e != nil {
		return nil, e
	}
	resp, e := c.client().Do(req)
	if e != nil {
		return nil, e
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("更新服务暂不可用（%d）", resp.StatusCode)
	}
	data, e := io.ReadAll(io.LimitReader(resp.Body, 64*1024+1))
	if e != nil || len(data) > 64*1024 {
		return nil, fmt.Errorf("更新清单过大或损坏")
	}
	var m Manifest
	dec := json.NewDecoder(strings.NewReader(string(data)))
	dec.DisallowUnknownFields()
	if e = dec.Decode(&m); e != nil {
		return nil, fmt.Errorf("更新清单格式错误")
	}
	var extra interface{}
	if dec.Decode(&extra) != io.EOF {
		return nil, fmt.Errorf("更新清单含多余数据")
	}
	if e = c.Verify(m); e != nil {
		return nil, e
	}
	cmp, _ := Compare(m.Version, c.CurrentVersion)
	if cmp <= 0 {
		return nil, nil
	}
	return &m, nil
}
func (c Client) Download(ctx context.Context, m Manifest, dir string) (string, error) {
	if e := c.Verify(m); e != nil {
		return "", e
	}
	if cmp, _ := Compare(m.Version, c.CurrentVersion); cmp <= 0 {
		return "", fmt.Errorf("禁止降级或重复更新")
	}
	if e := os.MkdirAll(dir, 0700); e != nil {
		return "", e
	}
	req, e := http.NewRequestWithContext(ctx, http.MethodGet, m.URL, nil)
	if e != nil {
		return "", e
	}
	resp, e := c.client().Do(req)
	if e != nil {
		return "", e
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("更新下载失败（%d）", resp.StatusCode)
	}
	f, e := os.CreateTemp(dir, "download-*.tmp")
	if e != nil {
		return "", e
	}
	temp := f.Name()
	defer os.Remove(temp)
	hash := sha256.New()
	n, e := io.Copy(io.MultiWriter(f, hash), io.LimitReader(resp.Body, m.Size+1))
	if e == nil {
		e = f.Sync()
	}
	ce := f.Close()
	if e == nil {
		e = ce
	}
	if e != nil {
		return "", e
	}
	if n != m.Size || hex.EncodeToString(hash.Sum(nil)) != m.SHA256 {
		return "", fmt.Errorf("更新包完整性校验失败")
	}
	head, e := os.Open(temp)
	if e != nil {
		return "", e
	}
	signature := make([]byte, 2)
	_, e = io.ReadFull(head, signature)
	head.Close()
	if e != nil || string(signature) != "MZ" {
		return "", fmt.Errorf("更新包不是 Windows 安装程序")
	}
	path := filepath.Join(dir, "Doc2GovPDF-"+m.Version+"-setup.exe")
	if e = os.Rename(temp, path); e != nil {
		return "", e
	}
	b, _ := json.Marshal(m)
	if e = os.WriteFile(path+".json", b, 0600); e != nil {
		return "", e
	}
	return path, nil
}
func (c Client) VerifyFile(m Manifest, path string) error {
	if e := c.Verify(m); e != nil {
		return e
	}
	f, e := os.Open(path)
	if e != nil {
		return e
	}
	defer f.Close()
	h := sha256.New()
	n, e := io.Copy(h, io.LimitReader(f, m.Size+1))
	if e != nil {
		return e
	}
	if n != m.Size || hex.EncodeToString(h.Sum(nil)) != m.SHA256 {
		return fmt.Errorf("安装前更新包校验失败")
	}
	return nil
}
