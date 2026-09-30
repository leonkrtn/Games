/** @type {import('next').NextConfig} */
export default {
  // web-push nutzt Node-Krypto und wird nicht gebündelt
  serverExternalPackages: ['web-push'],
};
