let io;

function setIo(socketIo) {
  io = socketIo;
}

function sendReading(data) {
  if (io) {
    io.emit("milk-reading", data);
  }
}

module.exports = {
  setIo,
  sendReading
};