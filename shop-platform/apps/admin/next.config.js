/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: false
  },
  async rewrites() {
    return [
      {
        source: "/api_proxy/:path*",
        destination: "http://127.0.0.1:8081/:path*"
      }
    ];
  }
};

module.exports = nextConfig;
