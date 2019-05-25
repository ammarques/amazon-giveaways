const request = require('request');
const ipc = require('electron').ipcRenderer;

const log = document.getElementById('logresult');

ipc.on('loggIt', function (event, items) {
  log.innerHTML = "";
  var content = "";
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    content += "<b>Link</b>: " + item.link + "<br>";
    content += "<b>Type</b>: " + item.type + "<br>";
    content += "--- <br><br>";
  }
  log.innerHTML = content;
});

const button = document.getElementById("queryButton");
const field = document.getElementById("queryField");

function sendForm(){
  ipc.send('initTask');
}

button.addEventListener('click', function () {
  sendForm();
});