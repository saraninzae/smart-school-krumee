// 🔴 URL API ของคุณครู (อัปเดตล่าสุด)
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzZSgCVEp9G4MWTb7YaJ723wNpHPprTx4_yq6MTQirW4Nk8KGp0r_uAz7YTZJhgzZASEQ/exec";

let matcher, isScanning = false;
let cooldownList = {};
const COOLDOWN_TIME = 5 * 60 * 1000; // 5 นาที
let eyeState = 'open'; 

// อัปเดตนาฬิกาบนหน้าจอ
setInterval(() => {
  const n = new Date();
  const clockEl = document.getElementById('clock');
  const dateEl = document.getElementById('date');
  if(clockEl) clockEl.innerText = n.toLocaleTimeString('th-TH');
  if(dateEl) dateEl.innerText = n.toLocaleDateString('th-TH', {weekday:'long', day:'numeric', month:'long'});
}, 1000);

// กด Enter ที่ช่องรหัสผ่านเพื่อปลดล็อก
document.addEventListener("DOMContentLoaded", () => {
    const passInput = document.getElementById('pass');
    if(passInput) {
        passInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') unlock(); });
    }
});

// 1. ฟังก์ชันปลดล็อกระบบ (ยิง API ไปเช็ครหัสผ่าน)
window.unlock = function() {
  const p = document.getElementById('pass').value;
  const btn = document.getElementById('btnUnlock');
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังตรวจสอบ...';
  btn.disabled = true;

  fetch(GAS_WEB_APP_URL, {
    method: 'POST',
    body: JSON.stringify({ action: "checkScannerPass", pass: p })
  })
  .then(res => res.json())
  .then(res => {
      if(res.success) {
        document.getElementById('gate').style.opacity = '0';
        setTimeout(() => { document.getElementById('gate').style.display = 'none'; }, 500);
        initAI(); 
      } else {
        Swal.fire({icon: 'error', title: 'รหัสผิด', text: 'รหัสผ่านไม่ถูกต้อง', confirmButtonColor: '#1a5276'});
        btn.innerHTML = '<i class="fa-solid fa-unlock-keyhole me-2"></i> เปิดระบบสแกน';
        btn.disabled = false;
      }
  })
  .catch(err => {
      Swal.fire('ข้อผิดพลาด', 'เซิร์ฟเวอร์ไม่ตอบสนอง: ' + err.message, 'error');
      btn.innerHTML = '<i class="fa-solid fa-unlock-keyhole me-2"></i> เปิดระบบสแกน';
      btn.disabled = false;
  });
};

// 2. โหลด AI และดึงฐานข้อมูลใบหน้า
async function initAI() {
  try {
    setStatus('<i class="fa-solid fa-cloud-arrow-down fa-bounce"></i> กำลังโหลดสมองกล AI...', 'status-wait');
    const url = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
    
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(url),
      faceapi.nets.faceLandmark68Net.loadFromUri(url),
      faceapi.nets.faceRecognitionNet.loadFromUri(url)
    ]);
    
    setStatus('<i class="fa-solid fa-database fa-flip"></i> กำลังดึงฐานข้อมูลใบหน้า...', 'status-wait');
    
    fetch(GAS_WEB_APP_URL + '?api=getFaces')
      .then(res => res.json())
      .then(data => {
        if(!data || data.length === 0) {
          return setStatus('⚠️ ไม่มีข้อมูลใบหน้าในระบบ', 'status-error');
        }
        try {
          const labeled = data.map(r => new faceapi.LabeledFaceDescriptors(r.name, [new Float32Array(r.descriptor)]));
          matcher = new faceapi.FaceMatcher(labeled, 0.55);
          startCam(); 
        } catch(e) {
          console.error(e); setStatus('❌ ฐานข้อมูลใบหน้ามีปัญหา', 'status-error');
        }
      })
      .catch(err => {
        console.error(err); setStatus('❌ ดึงข้อมูลล้มเหลว', 'status-error');
      });

  } catch (error) {
    console.error(error); setStatus('❌ โหลด AI ล้มเหลว', 'status-error');
  }
}

// 3. เปิดกล้อง
function startCam() {
  setStatus('<i class="fa-solid fa-camera fa-spin"></i> กำลังเปิดกล้อง...', 'status-wait');
  navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } } })
    .then(stream => {
      const v = document.getElementById('video');
      v.srcObject = stream;
      setStatus('📷 มองกล้อง แล้วกะพริบตา 1 ครั้ง', 'status-wait');
      v.addEventListener('play', detect);
    })
    .catch(err => setStatus('❌ ไม่สามารถเปิดกล้องได้', 'status-error'));
}

// ฟังก์ชันคำนวณการกะพริบตา
function getEAR(eye) {
  const d1 = dist(eye[1], eye[5]);
  const d2 = dist(eye[2], eye[4]);
  const d3 = dist(eye[0], eye[3]);
  return (d1 + d2) / (2 * d3);
}
function dist(p1, p2) { return Math.hypot(p1.x - p2.x, p1.y - p2.y); }

// 4. ลูปตรวจจับใบหน้าและการกะพริบตา (Liveness Detection)
async function detect() {
  const v = document.getElementById('video');
  const c = document.getElementById('canvas');
  const displaySize = { width: v.offsetWidth, height: v.offsetHeight };
  faceapi.matchDimensions(c, displaySize);

  setInterval(async () => {
    if(isScanning) return; 

    const d = await faceapi.detectSingleFace(v).withFaceLandmarks().withFaceDescriptor();
    c.getContext('2d').clearRect(0, 0, c.width, c.height);

    if(d) {
      const match = matcher.findBestMatch(d.descriptor);
      const box = faceapi.resizeResults(d, displaySize).detection.box;
      new faceapi.draw.DrawBox(box, { label: match.toString(), boxColor: match.label === 'unknown' ? 'red' : '#0d6efd' }).draw(c);

      if(match.label !== 'unknown') {
        
        if(isInCooldown(match.label)) {
           setStatus(`⏳ คุณ${match.label} เพิ่งสแกนไป (รอสักครู่)`, 'status-wait');
           eyeState = 'open';
           return; 
        }

        const leftEye = d.landmarks.getLeftEye();
        const rightEye = d.landmarks.getRightEye();
        const ear = (getEAR(leftEye) + getEAR(rightEye)) / 2;

        if (ear < 0.28) { 
           eyeState = 'closed'; 
           setStatus(`😉 ดีมาก! ลืมตาขึ้นเลยครับ...`, 'status-active');
        } 
        else if (ear > 0.29 && eyeState === 'closed') {
           eyeState = 'open';
           processScan(match.label, v);
        } 
        else {
           if (eyeState === 'open') {
             setStatus(`👁️ คุณ${match.label} กะพริบตา 1 ครั้ง`, 'status-active');
           }
        }
      } else {
        setStatus('❌ ไม่รู้จักใบหน้า', 'status-error');
        eyeState = 'open';
      }
    } else {
      setStatus('📷 มองกล้อง แล้วกะพริบตา 1 ครั้ง', 'status-wait');
      eyeState = 'open';
    }
  }, 150);
}

function isInCooldown(name) {
  if(!cooldownList[name]) return false;
  return (new Date().getTime() - cooldownList[name]) < COOLDOWN_TIME;
}

// 5. ส่งข้อมูลการลงเวลาและรูปภาพไปที่ Google Sheets + Telegram
function processScan(name, video) {
  isScanning = true;
  cooldownList[name] = new Date().getTime(); 
  setStatus(`⏳ กำลังบันทึกข้อมูล คุณ${name}...`, 'status-active');
  
  const cc = document.createElement('canvas');
  cc.width = video.videoWidth; cc.height = video.videoHeight;
  cc.getContext('2d').drawImage(video, 0, 0);
  const img = cc.toDataURL('image/jpeg', 0.8);

  fetch(GAS_WEB_APP_URL, {
    method: 'POST',
    body: JSON.stringify({ action: "สแกนหน้า", name: name, image: img })
  })
  .then(res => res.json())
  .then(res => {
      if(res.success) {
        Swal.fire({
          icon: 'success', 
          title: res.type,
          html: `คุณ<b>${res.name}</b><br>เวลา ${res.time} น.<br>สถานะ: <span class="badge ${res.status === 'สาย' ? 'bg-danger' : 'bg-success'}">${res.status}</span>`,
          timer: 3000,
          showConfirmButton: false
        });
      } else {
        Swal.fire({ icon: 'warning', title: 'ไม่สามารถบันทึกได้', text: res.msg, timer: 4000 });
      }
      setTimeout(() => { isScanning = false; setStatus('📷 พร้อมสแกนคนถัดไป', 'status-wait'); }, 3000);
  })
  .catch(err => {
      Swal.fire('ข้อผิดพลาด', err.message, 'error');
      isScanning = false;
      setStatus('📷 พร้อมสแกนคนถัดไป', 'status-wait');
  });
}

function setStatus(txt, cls) {
  const s = document.getElementById('status');
  if(s) {
    s.innerHTML = txt; s.className = 'liveness-status ' + cls;
  }
}
