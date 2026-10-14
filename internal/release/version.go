package release

// Build-time release configuration. Empty publication settings never imply
// an operational update service. Production values are injected by release CI.
var Version = "0.2.0"
var Channel = "internal"
var UpdateURL string
var PublicKey string
