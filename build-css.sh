#!/bin/sh
# Rebuild app.css from the Tailwind classes used in index.html.
# Run after changing classes in index.html (needs Node.js; Tailwind is downloaded on first run).
cd "$(dirname "$0")"
cat > /tmp/bill-splitter-tw.config.js <<'EOF'
module.exports = {
    content: [process.cwd() + '/index.html'],
    darkMode: 'class',
    theme: { extend: { fontFamily: { sans: ['Inter', 'sans-serif'] } } },
};
EOF
printf '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n' > /tmp/bill-splitter-tw.input.css
npx --yes tailwindcss@3.4.17 -c /tmp/bill-splitter-tw.config.js -i /tmp/bill-splitter-tw.input.css -o app.css --minify
