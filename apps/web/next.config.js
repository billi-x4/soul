/** @type {import('next').NextConfig} */
// Walrus Site target = a fully static export (no Next server runtime). Soul's UI is client-side and
// talks to the external API, so static export is the decentralized-hosting build (Constitution IX).
// Gated by WALRUS_SITE so the normal dev/SSR build is unchanged: `WALRUS_SITE=1 pnpm build` → ./out.
const isWalrusSite = process.env.WALRUS_SITE === "1";

const nextConfig = {
  images: {
    unoptimized: isWalrusSite,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
    dangerouslyAllowSVG: true,
  },
  ...(isWalrusSite ? { output: "export", trailingSlash: true } : {}),
};

export default nextConfig;
