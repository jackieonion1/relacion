// Version and build time shown in Ajustes; CRA only exposes REACT_APP_* and reads them after this file loads
process.env.REACT_APP_VERSION = require('./package.json').version;
process.env.REACT_APP_BUILD_TIME = process.env.REACT_APP_BUILD_TIME || new Date().toISOString();

module.exports = {
  style: {
    postcssOptions: {
      plugins: [
        require('tailwindcss'),
        require('autoprefixer'),
      ],
    },
  },
};
