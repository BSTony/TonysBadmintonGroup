import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

target1 = r"""  s.on('pinball_shake', () => {"""
replacement1 = r"""  s.on('pinball_apply_force', (data) => {
    const { name, fx } = data;
    const myName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.displayName : null;
    if (name !== myName && pbBalls && pbBalls[name]) {
      Matter.Body.applyForce(pbBalls[name], pbBalls[name].position, { x: fx, y: 0 });
    }
  });

  s.on('pinball_shake', () => {"""

content = content.replace(target1, replacement1)

# Append gyro logic to the end of the file
gyro_logic = r"""

  // --- G-Sensor (DeviceOrientation) support ---
  let lastForceEmit = 0;
  window.addEventListener('deviceorientation', (event) => {
    if (!window.pinballRaceStarted || pbState.status !== 'playing' || !pbBalls || !pbEngine) return;
    const myName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.displayName : null;
    const myBall = myName ? pbBalls[myName] : null;
    
    if (myBall && event.gamma !== null) {
      // gamma is left-to-right tilt in degrees (-90 to 90)
      let tilt = event.gamma;
      
      // Ignore very small tilts to avoid jitter
      if (Math.abs(tilt) < 5) return;
      
      if (tilt > 30) tilt = 30;
      if (tilt < -30) tilt = -30;
      
      // Calculate small horizontal force
      const forceX = (tilt / 30) * 0.0015; 
      
      // Apply locally
      Matter.Body.applyForce(myBall, myBall.position, { x: forceX, y: 0 });
      
      // Emit to others (throttled to ~10fps)
      const now = Date.now();
      if (now - lastForceEmit > 100) {
        if (typeof pinballSocket !== 'undefined') {
          pinballSocket.emit('pinball_apply_force', { name: myName, fx: forceX });
        }
        lastForceEmit = now;
      }
    }
  });

  window.requestPinballGyroPermission = function() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then(permissionState => {
          if (permissionState === 'granted') {
            alert('✅ 體感控制已啟用！開始比賽後，左右傾斜手機即可控制你的專屬彈珠！');
          } else {
            alert('❌ 體感控制權限已被拒絕。');
          }
        })
        .catch(console.error);
    } else {
      alert('✅ 您的設備已自動啟用體感控制！開始比賽後，左右傾斜手機即可控制彈珠！');
    }
  };
"""

content += gyro_logic

with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("done")
