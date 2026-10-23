package feedback

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"mime/multipart"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRequestBoundaries(t *testing.T) {
	run := func(body []byte, ct string) error {
		r := httptest.NewRequest("POST", "/api/feedback/threads", bytes.NewReader(body))
		r.Header.Set("Content-Type", ct)
		_, _, e := parse(httptest.NewRecorder(), r)
		return e
	}
	input := Input{ClientRequestID: RandomToken(), AccessToken: RandomToken(), Description: "虚构反馈"}
	valid, _ := json.Marshal(input)
	if e := run(valid, "application/json"); e != nil {
		t.Fatal(e)
	}
	for _, body := range [][]byte{[]byte(`{"clientRequestId":"guess","description":"x"}`), []byte(`{"description":"","clientRequestId":"` + RandomToken() + `"}`), append(append([]byte{}, valid...), []byte(`{}`)...), []byte(`{"clientRequestId":"` + RandomToken() + `","description":"x","sourceDocument":"hidden"}`), []byte(`{"clientRequestId":"` + RandomToken() + `","description":"x","technicalInfo":{"documentTitle":"private"}}`), []byte(strings.Repeat("a", 65537))} {
		if run(body, "application/json") == nil {
			t.Fatal("invalid/implicit data accepted")
		}
	}
	if run(valid, "text/plain") == nil {
		t.Fatal("unsupported request media accepted")
	}
	var b bytes.Buffer
	mw := multipart.NewWriter(&b)
	p, _ := mw.CreateFormField("payload")
	p.Write(valid)
	for i := 0; i < 5; i++ {
		f, _ := mw.CreateFormFile("files", "x.png")
		f.Write(fixturePNG())
	}
	mw.Close()
	if run(b.Bytes(), mw.FormDataContentType()) == nil {
		t.Fatal("fifth attachment accepted")
	}
	var big bytes.Buffer
	png.Encode(&big, image.NewGray(image.Rect(0, 0, 4097, 1)))
	if _, e := sanitizeAttachment("x.png", big.Bytes()); e == nil {
		t.Fatal("oversized pixel bounds accepted")
	}
	s := &Server{cfg: Config{Enabled: true, Operator: "virtual", Purpose: "virtual", AccessScope: "local", RetentionDays: 1, DeletionContact: "receipt", AttachmentDir: "private", AdminToken: RandomToken()}, rates: map[string]rate{}}
	r := httptest.NewRequest("POST", "/api/feedback/threads", bytes.NewReader(valid))
	r.Header.Set("Origin", "https://attacker.invalid")
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatal("cross-site request accepted")
	}
	for i := 0; i < 60; i++ {
		if !s.allow(httptest.NewRequest("GET", "/", nil)) {
			t.Fatal("rate limit too early")
		}
	}
	if s.allow(httptest.NewRequest("GET", "/", nil)) {
		t.Fatal("rate limit absent")
	}
}

func TestUnimplementedNotificationsAndBusyGate(t *testing.T) {
	s := &Server{cfg: Config{Enabled: true, Operator: "virtual", Purpose: "virtual", AccessScope: "local", RetentionDays: 1, DeletionContact: "receipt", AttachmentDir: "private", AdminToken: RandomToken(), NotificationsEnabled: true}, rates: map[string]rate{}}
	r := httptest.NewRequest("GET", "/api/feedback/config", nil)
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	if !strings.Contains(w.Body.String(), `"notificationsEnabled":false`) {
		t.Fatal("policy flag falsely advertised notification implementation")
	}
	in := Input{ClientRequestID: RandomToken(), AccessToken: RandomToken(), Description: "virtual", Notify: true}
	b, _ := json.Marshal(in)
	r = httptest.NewRequest("POST", "/api/feedback/threads", bytes.NewReader(b))
	r.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	s.ServeHTTP(w, r)
	if w.Code != 400 {
		t.Fatal("notify accepted without sender")
	}
	s.slots = make(chan struct{}, 2)
	s.slots <- struct{}{}
	s.slots <- struct{}{}
	r = httptest.NewRequest("POST", "/api/feedback/threads", bytes.NewReader(b))
	r.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	s.ServeHTTP(w, r)
	if w.Code != 503 {
		t.Fatal("unbounded upload decoding")
	}
}

func TestExampleSemanticWhitelist(t *testing.T) {
	good := []byte(`{"version":1,"kind":"doc2govpdf-feedback-example","blocks":[{"type":"paragraph","text":"虚构","role":"heading2","align":"center","indent":"none","before":"half","after":"one"},{"type":"table","header":false,"rows":[["数据"]]}]}`)
	a, e := sanitizeAttachment("example.json", good)
	if e != nil {
		t.Fatal(e)
	}
	var value map[string]any
	if e = json.Unmarshal(a.data, &value); e != nil {
		t.Fatal(e)
	}
	blocks := value["blocks"].([]any)
	p := blocks[0].(map[string]any)
	for key, want := range map[string]string{"role": "heading2", "align": "center", "indent": "none", "before": "half", "after": "one"} {
		if p[key] != want {
			t.Fatal("selected semantics lost", key)
		}
	}
	if blocks[1].(map[string]any)["header"] != false {
		t.Fatal("false header lost")
	}
	for _, key := range []string{"role", "align", "indent", "before", "after"} {
		for _, bad := range []string{`""`, `"unknown"`, `null`, `3`} {
			input := []byte(fmt.Sprintf(`{"version":1,"kind":"doc2govpdf-feedback-example","blocks":[{"type":"paragraph","text":"虚构","%s":%s}]}`, key, bad))
			if _, e = sanitizeAttachment("example.json", input); e == nil {
				t.Fatal("invalid paragraph semantics accepted", key, bad)
			}
		}
	}
	for _, bad := range []string{`"true"`, `null`, `3`} {
		input := []byte(fmt.Sprintf(`{"version":1,"kind":"doc2govpdf-feedback-example","blocks":[{"type":"table","rows":[["虚构"]],"header":%s}]}`, bad))
		if _, e = sanitizeAttachment("example.json", input); e == nil {
			t.Fatal("invalid header accepted", bad)
		}
	}
	for _, input := range []string{`{"type":"paragraph","text":"虚构","font":"private-font"}`, `{"type":"paragraph","text":"虚构","header":true}`, `{"type":"table","rows":[["虚构"]],"role":"body"}`} {
		raw := []byte(`{"version":1,"kind":"doc2govpdf-feedback-example","blocks":[` + input + `]}`)
		if _, e = sanitizeAttachment("example.json", raw); e == nil {
			t.Fatal("cross-type or hidden semantics accepted")
		}
	}
}
