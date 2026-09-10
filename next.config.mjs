const isDev = process.env.NODE_ENV === "development";

// Hostname vlastniho Supabase projektu pro next/image (viz images.remotePatterns nize).
const supabaseImageHostname = (() => {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!rawUrl) {
    return null;
  }
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return null;
  }
})();

// CSP: skripty jen z vlastní domény ('unsafe-inline' vyžaduje Next.js hydratace,
// 'unsafe-eval' jen v dev režimu kvůli hot reloadu). Obrázky povolují https:
// kvůli externím ilustracím misí z Mozek editoru. connect-src omezen na Supabase.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co${isDev ? " ws:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'"
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // R27: tiskové PDF si font a ilustrace čte z assets/print za běhu. Bez tohohle
  // zápisu by je serverless funkce na Vercelu neměla u sebe a tisk by spadl.
  outputFileTracingIncludes: {
    "/api/export/game-content": ["./assets/print/**/*"]
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb"
    }
  },
  images: {
    // Jen vlastni Supabase Storage. Wildcard "**" delal z image optimizeru
    // otevrenou proxy - kdokoliv by pres nej mohl tahat a cachovat cizi
    // obrazky na ucet tohoto projektu.
    remotePatterns: supabaseImageHostname
      ? [
          {
            protocol: "https",
            hostname: supabaseImageHostname,
            pathname: "/storage/v1/object/public/**"
          }
        ]
      : []
  },
  // R27: /paper-score byla samostatná papírová obrazovka. Papírová cesta teď žije
  // v tiskové sekci na detailu hry, takže stará adresa vede na výběr her.
  async redirects() {
    return [{ source: "/paper-score", destination: "/", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
        ]
      }
    ];
  }
};

export default nextConfig;
