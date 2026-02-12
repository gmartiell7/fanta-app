const fs = require('fs');
const pngToIco = require('png-to-ico');

(async () => {
  const buf = await pngToIco('favicon.png');
  fs.writeFileSync('favicon.ico', buf);
})();
