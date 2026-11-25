import base from './playwright.config.mjs';
export default {...base, testDir:'./tests/browser',outputDir:'../test-results/311-targeted',use:{...base.use,baseURL:'http://127.0.0.1:5189',headless:true},webServer:{command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5189 --strictPort',url:'http://127.0.0.1:5189',reuseExistingServer:false,timeout:30000}};
