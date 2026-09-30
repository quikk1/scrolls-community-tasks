(function(){
  var body = (document.body && document.body.innerText || "").replace(/\s+/g, " ").slice(0, 300);
  return JSON.stringify({ title: document.title, body: body }, null, 1);
})();
