// Replace the candidate sheet: appending history leaves candidate-only rules
// active and can make both sides of the geometry comparison equally wrong.
export async function measureHistoricalWidth(browser, historicalCSS, metrics) {
 const candidateCSS=await browser.evaluate(`document.getElementById('width-plugin-css').textContent`)
 try {
  await browser.evaluate(`document.getElementById('width-plugin-css').textContent=${JSON.stringify(historicalCSS)};settle()`)
  return await browser.evaluate(metrics)
 } finally {
  await browser.evaluate(`document.getElementById('width-plugin-css').textContent=${JSON.stringify(candidateCSS)};settle()`)
 }
}
