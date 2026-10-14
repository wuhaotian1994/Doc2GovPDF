package update

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestSignedDownloadAndTamper(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	payload := []byte("MZ-test-install-package")
	hash := sha256.Sum256(payload)
	var m Manifest
	s := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/manifest" {
			json.NewEncoder(w).Encode(m)
		} else {
			w.Write(payload)
		}
	}))
	defer s.Close()
	m = Manifest{Version: "1.1.0", URL: s.URL + "/setup", SHA256: hex.EncodeToString(hash[:]), Size: int64(len(payload))}
	m.Signature = base64.StdEncoding.EncodeToString(ed25519.Sign(priv, m.SignedBytes()))
	c := Client{HTTP: s.Client(), PublicKey: pub, CurrentVersion: "1.0.0", ManifestURL: s.URL + "/manifest"}
	got, e := c.Check(context.Background())
	if e != nil || got == nil {
		t.Fatal(e)
	}
	path, e := c.Download(context.Background(), *got, t.TempDir())
	if e != nil {
		t.Fatal(e)
	}
	if e = c.VerifyFile(m, path); e != nil {
		t.Fatal(e)
	}
	os.WriteFile(path, []byte("tampered"), 0600)
	if c.VerifyFile(m, path) == nil {
		t.Fatal("tampered update accepted")
	}
	payload = []byte("MZ-corrupt-payload-now")
	if _, e = c.Download(context.Background(), m, t.TempDir()); e == nil {
		t.Fatal("corrupt download accepted")
	}
	m.Version = "1.2.0"
	if c.Verify(m) == nil {
		t.Fatal("unsigned metadata mutation accepted")
	}
}
func TestUpdateGuards(t *testing.T) {
	for _, pair := range [][2]string{{"1.0.0", "1.0.0"}, {"1.2.0", "1.10.0"}, {"2.0.0", "1.9.9"}} {
		n, e := Compare(pair[0], pair[1])
		if e != nil {
			t.Fatal(e)
		}
		if pair[0] == pair[1] && n != 0 {
			t.Fatal("equal versions")
		}
	}
	if _, e := Compare("1.0.0;cmd", "1.0.0"); e == nil {
		t.Fatal("invalid version accepted")
	}
	if validateURL("http://example.org/update") == nil {
		t.Fatal("insecure update accepted")
	}
}
