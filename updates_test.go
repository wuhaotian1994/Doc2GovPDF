package main

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"doc2govpdf/internal/update"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestBackgroundUpdateStagesOnlyVerifiedPackage(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	payload := []byte("MZ-integration-test-payload")
	hash := sha256.Sum256(payload)
	var manifest update.Manifest
	requests := 0
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		if r.URL.Path == "/manifest" {
			json.NewEncoder(w).Encode(manifest)
		} else {
			w.Write(payload)
		}
	}))
	defer server.Close()
	manifest = update.Manifest{Version: "0.3.0", URL: server.URL + "/installer", SHA256: hex.EncodeToString(hash[:]), Size: int64(len(payload))}
	manifest.Signature = base64.StdEncoding.EncodeToString(ed25519.Sign(priv, manifest.SignedBytes()))
	old := newUpdateClient
	defer func() { newUpdateClient = old }()
	newUpdateClient = func() update.Client {
		return update.Client{HTTP: server.Client(), PublicKey: pub, CurrentVersion: "0.2.0", ManifestURL: server.URL + "/manifest"}
	}
	a := &App{ctx: context.Background(), draftDir: t.TempDir()}
	a.checkUpdate(context.Background())
	if a.pendingUpdate == nil || !a.UpdateStatus().Ready {
		t.Fatal("verified update not staged")
	}
	data, e := os.ReadFile(a.pendingUpdate.Installer)
	if e != nil || string(data) != string(payload) {
		t.Fatal("wrong staged payload")
	}
	before := requests
	a.checkUpdate(context.Background())
	if requests != before {
		t.Fatal("repeated request within 24 hours")
	}
	if _, e = os.Stat(filepath.Join(a.draftDir, "updates", "pending.json")); e != nil {
		t.Fatal("pending update not persisted")
	}
	a2 := &App{ctx: context.Background(), draftDir: t.TempDir()}
	a2.SavePreferences(Preferences{AutoUpdate: false, OutputFormat: "both"})
	a2.checkUpdate(context.Background())
	if requests != before {
		t.Fatal("disabled update still contacted network")
	}
}
