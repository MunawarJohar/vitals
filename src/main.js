document.querySelector('#record').addEventListener('click', onRecord);

const inProduction = false; // hide video and tmp canvas
const channel = 'r'; // red only, green='g' and blue='b' channels can be added

let video, c_tmp, ctx_tmp; // video from rear-facing-camera and tmp canvas
let frameCount = 0; // count number of video frames processed 
let delay = 0; // delay = 100; should give us 10 fps, estimated around 7
let numOfQualityFrames = 0; // TODO: count the number of quality frames
let xMeanArr = [];
let xMean = 0;
let initTime;
let isSignal = 0;
let acFrame = 0.008; // start with dummy flat signal
let acWindow = 0.008;

let nFrame = 0;
const WINDOW_LENGTH = 300; // 300 frames = 5s @ 60 FPS
let acdc = Array(WINDOW_LENGTH).fill(0.5);
let ac = Array(WINDOW_LENGTH).fill(0.5);

// draw the signal data as it comes
let lineArr = [];
const MAX_LENGTH = 100;
const DURATION = 100;
let chart = realTimeLineChart();

let constraintsObj = {
  audio: false,
  video: {
    maxWidth: 1280,
    maxHeight: 720,
    frameRate: { ideal: 60 },
    facingMode: 'environment' // rear-facing-camera
  }
};

function setWH() {
  let [w, h] = [video.videoWidth, video.videoHeight];
  document.getElementById('solar-nuclear-photovoltaic-delay').innerHTML = `Frame compute delay: ${delay}`;
  document.getElementById('solar-nuclear-photovoltaic-resolution').innerHTML = `Video resolution: ${w} x ${h}`;
  c_tmp.setAttribute('width', w);
  c_tmp.setAttribute('height', h);
}

function init() {
  c_tmp = document.getElementById('output-canvas');
  c_tmp.style.display = 'none';
  if (inProduction) {
    c_tmp.style.display = 'none';
  }
  ctx_tmp = c_tmp.getContext('2d');
}

function computeFrame() {
  if (nFrame > DURATION) {
    ctx_tmp.drawImage(video,
      0, 0, video.videoWidth, video.videoHeight);
    let frame = ctx_tmp.getImageData(
      0, 0, video.videoWidth, video.videoHeight);

    // process each frame
    const count = frame.data.length / 4;
    let rgbRed = 0;
    for (let i = 0; i < count; i++) {
      rgbRed += frame.data[i * 4];
    }
    // invert to plot the PPG signal
    xMean = 1 - rgbRed / (count * 255);
    ccalc(xMean)
    let xMeanData = {
      time: (new Date() - initTime) / 1000,
      x: xMean
    };

    acdc[nFrame % WINDOW_LENGTH] = xMean;

    // TODO: calculate AC from AC-DC only each WINDOW_LENGTH time:
    if (nFrame % WINDOW_LENGTH == 0) {
      // console.log(`nFrame = ${nFrame}`);
      // console.log(`ac = ${acdc}`);
      // console.log(`ac-detrended = ${detrend(acdc)}`);
      document.getElementById('solar-nuclear-photovoltaic-signal-window').innerHTML = `nWindow: ${nFrame / WINDOW_LENGTH}`;
      if ((nFrame / 100) % 2 == 0) {
        isSignal = 1;
        ac = detrend(acdc);
        acWindow = windowMean(ac);
      } else {
        ac = Array(WINDOW_LENGTH).fill(acWindow);
        isSignal = 0;
      }
    }

    acFrame = ac[nFrame % WINDOW_LENGTH];

    xMeanArr.push(xMeanData);

    document.getElementById('solar-nuclear-photovoltaic-frame-time').innerHTML = `Frame time: ${xMeanData.time.toFixed(2)}`;
    document.getElementById('solar-nuclear-photovoltaic-video-time').innerHTML = `Video time: ${(video.currentTime.toFixed(2))}`;
    document.getElementById('solar-nuclear-photovoltaic-signal').innerHTML = `X: ${xMeanData.x}`;
    
    const fps = (++frameCount / video.currentTime).toFixed(3);
    document.getElementById('solar-nuclear-photovoltaic-frame-fps').innerHTML = `Frame count: ${frameCount}, FPS: ${fps}`;

    ctx_tmp.putImageData(frame, 0, 0);
  }
  nFrame += 1;
  setTimeout(computeFrame, delay); // continue with delay
}

function windowMean(y) {
  const n = y.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += y[i]
  }

  return sum / n;
}

function detrend(y) {
  const n = y.length;
  let x = [];
  for (let i = 0; i <= n; i++) {
    x.push(i);
  }

  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i];
    sy += y[i];
    sxy += x[i] * y[i];
    sxx += x[i] * x[i];
  }
  const mx = sx / n;
  const my = sy / n;
  const xx = n * sxx - sx * sx;
  const xy = n * sxy - sx * sy;
  const slope = xy / xx;
  const intercept = my - slope * mx;

  detrended = [];
  for (let i = 0; i < n; i++) {
    detrended.push(y[i] - (intercept + slope * i));
  }

  return detrended;
}

function onRecord() {
  this.disabled = true;
  navigator.mediaDevices.getUserMedia(constraintsObj)
    .then(function(mediaStreamObj) {

      // we must turn on the LED / torch
      const track = mediaStreamObj.getVideoTracks()[0];
      const imageCapture = new ImageCapture(track)
      const photoCapabilities = imageCapture.getPhotoCapabilities()
        .then(() => {
          track.applyConstraints({
              advanced: [{ torch: true }]
            })
            .catch(err => console.log('No torch', err));
        })
        .catch(err => console.log('No torch', err));

      video = document.getElementById('video');
      if (inProduction) {
        video.style.display = 'none';
      }

      if ("srcObject" in video) {
        video.srcObject = mediaStreamObj;
      } else {
        // for older versions of browsers
        video.src = window.URL.createObjectURL(mediaStreamObj);
      }

      video.onloadedmetadata = function(ev) {
        video.play();
      };

      init();
      video.addEventListener('play', setWH);
      video.addEventListener('play', computeFrame);
      video.addEventListener('play', drawLineChart);

      video.onpause = function() {
        console.log('paused');
      };
    })
    .catch(error => console.log(error));
}

function pauseVideo() {
  video.pause();
  video.currentTime = 0;
}

function seedData() {
  let now = new Date();

  for (let i = 0; i < MAX_LENGTH; ++i) {
    lineArr.push({
      time: new Date(now.getTime() - initTime - ((MAX_LENGTH - i) * DURATION)),
      x: 0.5,
      signal: isSignal
    });
  }
}

function updateData() {
  let now = new Date();

  let lineData = {
    time: now - initTime,
    x: acFrame,
    signal: isSignal
  };
  lineArr.push(lineData);

  // if (lineArr.length > 1) {
  lineArr.shift();
  // }
  d3.select("#solar-nuclear-photovoltaic-chart").datum(lineArr).call(chart);
}

function resize() {
  if (d3.select("#chart svg").empty()) {
    return;
  }
  chart.width(+d3.select("#solar-nuclear-photovoltaic-chart").style("width").replace(/(px)/g, ""));
  d3.select("#solar-nuclear-photovoltaic-chart").call(chart);
}

function drawLineChart() {
  initTime = new Date();

  seedData();
  window.setInterval(updateData, 100);
  d3.select("#solar-nuclear-photovoltaic-chart").datum(lineArr).call(chart);
  d3.select(window).on('resize', resize);
}
 // Function to generate unique IDs
function generateID(num) {
  return "cal" + num;
}

// Function to create and populate the table
function createTable() {
  var tbody = document.getElementById("table-body");
  var count = 1; // To keep track of the calculation ID

  for (var row = 1; row <= 10; row++) {
      var tr = document.createElement("tr");
      var td = document.createElement("td");
      td.textContent = row;
      tr.appendChild(td);

      for (var col = 1; col <= 10; col++) {
          var td = document.createElement("td");
          var div = document.createElement("div");
          div.id = generateID(count++);
          div.textContent = "Content";
          td.appendChild(div);
          tr.appendChild(td);
      }

      tbody.appendChild(tr);
  }
}

// Call the function to generate the table
createTable();

        function ccalc(xval) {
          // Array of calculation variables
          var cal = [
              xval * 4,
              xval * 5,
              xval * 6,
              xval * (45 + 3),
              xval * ((45 * 3) / 2),
              xval * ((45 * 8) / 2),
              xval * ((45 * 8) / 2),
              xval * ((45 * 8) / 2),
              xval * ((45 * 8) / 2),
              xval * ((45 * 8) / 2),
              xval * ((45 * 8) / 2),
              xval * ((45 * 3) / 2),
              xval * ((45 * 8) / 2),
              xval * ((45 * 8) / 2),
              xval * ((45 * 8) / 2),
              xval * ((45 * 8) / 2),
              xval * ((45 * 8) / 2),
              xval * ((45 * 8) / 2),
              xval * ((45 * 3) / 2),
              xval * ((45 * 8) / 2),
              xval * ((45 * 8) / 2),
              xval * ((45 * 8) / 2),
              xval * ((45 * 8) / 2),
              xval * ((45 * 8) / 2),
              xval * ((45 * 8) / 2),
              // add more calculations here manually up to the 100th calculation
          ];
      
          // Loop through the calculation variables
          for (var i = 0; i < cal.length; i++) {
              // Create the ID dynamically
              var calID = 'cal' + (i + 1);
      
              // Create the content string
              var content = 'C' + (i + 1) + ': ' + cal[i];
      
              // Update the content of the div
              document.getElementById(calID).innerHTML = content;
          }
      }
      

