import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { FIRMS_CSV_URL } from './api/firms.js';
import { CENSUS_GEOCODER, censusQuery } from './api/geocode.js';

const firms = new URL(FIRMS_CSV_URL);
const census = new URL(CENSUS_GEOCODER);

// Stand in for the serverless functions while running locally. Both upstream
// services refuse cross-origin reads, which is the only reason they exist.
const proxy = {
  '/api/firms': {
    target: firms.origin,
    changeOrigin: true,
    rewrite: () => firms.pathname,
  },
  '/api/geocode': {
    target: census.origin,
    changeOrigin: true,
    rewrite: (path) => {
      const address = new URL(path, 'http://x').searchParams.get('address') ?? '';
      return `${census.pathname}?${censusQuery(address)}`;
    },
  },
};

export default defineConfig({
  plugins: [react()],
  // host: true binds every interface, so http://localhost works whether the
  // browser resolves it to IPv4 or IPv6 -- and the phone on the same wifi can
  // open it too, which is how this app is really meant to be used.
  server: { host: true, proxy },
  preview: { host: true, proxy },
});
