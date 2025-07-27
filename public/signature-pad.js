window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('signatureCanvas');
  const clearBtn = document.getElementById('clearBtn');
  const form = document.getElementById('signForm');
  const ctx = canvas.getContext('2d');
  let drawing = false;

  function resizeCanvas() {
    canvas.width = canvas.offsetWidth;
    canvas.height = 200;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  canvas.addEventListener('mousedown', e => { drawing = true; draw(e); });
  canvas.addEventListener('mouseup', () => drawing = false);
  canvas.addEventListener('mousemove', draw);

  canvas.addEventListener('touchstart', e => { drawing = true; draw(e.touches[0]); });
  canvas.addEventListener('touchend', () => drawing = false);
  canvas.addEventListener('touchmove', e => draw(e.touches[0]));

  function draw(e) {
    if (!drawing) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  clearBtn.addEventListener('click', e => {
    e.preventDefault();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  });

  form.addEventListener('submit', e => {
    const dataURL = canvas.toDataURL('image/png');
    document.getElementById('signatureInput').value = dataURL;
  });
});
