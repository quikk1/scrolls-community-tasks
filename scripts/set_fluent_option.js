(function(){
  // Click a Fluent dropdown button then click the matching option by text.
  // args via window.__pick = {btn: selector, want: "text"} set by caller eval.
  var btnSel = window.__pickBtn, want = window.__pickWant;
  var btn = document.querySelector(btnSel);
  if (!btn) return "no-btn:" + btnSel;
  btn.click();
  return "clicked";
})();
