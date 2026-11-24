// server.js
//
// Entry point. Run with `npm start` (see package.json) or plug the
// `leadsRouter` into an existing Next.js/Express app - see README.md
// "Integrating into an existing edgecoursebd.com backend" for that path.

const { createApp } = require("./app");

const PORT = process.env.PORT || 4000;
const app = createApp();

app.listen(PORT, () => {
  console.log(`HulkenStein leads API running on port ${PORT}`);
  console.log(`  POST   /api/leads            - submit a lead (public, rate-limited)`);
  console.log(`  GET    /api/leads            - list leads (requires x-api-key header)`);
  console.log(`  GET    /api/leads/stats      - quick counts (requires x-api-key header)`);
  console.log(`  GET    /api/leads/export.csv - download CSV (requires x-api-key header)`);
});
