// Serve the preview locally: node preview.mjs [port]
import { serve } from "./tools/common.mjs";
const { port } = await serve(Number(process.argv[2]) || 4173);
console.log(`GetGold.ae reel preview: http://127.0.0.1:${port}/`);
