const backend = {
  target: 'http://localhost:3000',
  secure: false,
};

module.exports = {
  '/api': backend,
  '/auth': {
    ...backend,
    bypass: (request) => {
      const accept = request.headers.accept || '';
      if (request.method === 'GET' && accept.includes('text/html')) {
        return '/index.html';
      }
    },
  },
  '/organizations': backend,
};
