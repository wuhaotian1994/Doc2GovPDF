// signrelease prepares public release metadata. Private keys never enter the
// installer, Git, or the update manifest.
package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"doc2govpdf/internal/update"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
)

func main() {
	generate := flag.Bool("generate-key", false, "generate a signing key")
	keyPath := flag.String("key", "", "private key path")
	input := flag.String("installer", "", "installer path")
	version := flag.String("version", "", "release version")
	url := flag.String("url", "", "public installer HTTPS URL")
	out := flag.String("out", "", "public manifest path")
	flag.Parse()
	if *keyPath == "" {
		fail("a private key path is required")
	}
	if *generate {
		pub, priv, e := ed25519.GenerateKey(rand.Reader)
		if e != nil {
			fail(e.Error())
		}
		f, e := os.OpenFile(*keyPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if e != nil {
			fail(e.Error())
		}
		if _, e = f.Write(priv); e != nil {
			f.Close()
			fail(e.Error())
		}
		f.Close()
		fmt.Println(base64.StdEncoding.EncodeToString(pub))
		return
	}
	key, e := os.ReadFile(*keyPath)
	if e != nil || len(key) != ed25519.PrivateKeySize {
		fail("invalid Ed25519 private key")
	}
	f, e := os.Open(*input)
	if e != nil {
		fail(e.Error())
	}
	h := sha256.New()
	n, e := io.Copy(h, f)
	f.Close()
	if e != nil {
		fail(e.Error())
	}
	m := update.Manifest{Version: *version, URL: *url, SHA256: hex.EncodeToString(h.Sum(nil)), Size: n}
	m.Signature = base64.StdEncoding.EncodeToString(ed25519.Sign(key, m.SignedBytes()))
	client := update.Client{PublicKey: ed25519.PrivateKey(key).Public().(ed25519.PublicKey), CurrentVersion: "0.0.0"}
	if e = client.Verify(m); e != nil {
		fail(e.Error())
	}
	b, _ := json.MarshalIndent(m, "", "  ")
	if *out == "" {
		fail("manifest output path required")
	}
	if e = os.WriteFile(*out, b, 0644); e != nil {
		fail(e.Error())
	}
	fmt.Println("Signed public manifest written.")
}
func fail(message string) { fmt.Fprintln(os.Stderr, message); os.Exit(1) }
