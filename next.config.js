/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  // Base path for GitHub Pages deployment
  // When deploying to user.github.io/repo-name, the base path should be /repo-name
  basePath: process.env.NODE_ENV === "production" ? "/drift-hero" : "",
  images: {
    unoptimized: true,
  },
  reactStrictMode: true,
  poweredByHeader: false
};

module.exports = nextConfig;
