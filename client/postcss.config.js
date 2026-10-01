// The same pipeline CRA 5 ran with Tailwind (react-scripts webpack.config.js): flexbugs fixes and
// preset-env stage 3, whose autoprefixer replaces the standalone one
module.exports = {
  plugins: {
    tailwindcss: {},
    'postcss-flexbugs-fixes': {},
    'postcss-preset-env': { autoprefixer: { flexbox: 'no-2009' }, stage: 3 },
  },
};
