import React from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

export function SplashAnimation({ onFinish }: { onFinish: () => void }) {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <style>
          body, html {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            background-color: #000;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          canvas {
            display: block;
            width: 100%;
            height: 100%;
          }
          .vignette {
            position: absolute;
            inset: 0;
            pointer-events: none;
            background: radial-gradient(circle, transparent 30%, black 100%);
          }
          .grain {
            position: absolute;
            inset: 0;
            pointer-events: none;
            opacity: 0.03;
            background: linear-gradient(90deg, rgba(255,255,255,0.1) 50%, transparent 50%);
            background-size: 3px 100%;
          }
          .ground-shadow {
            position: absolute;
            bottom: 0;
            width: 100%;
            height: 33.33%;
            background: linear-gradient(to top, black, transparent);
            pointer-events: none;
            opacity: 0.8;
          }
        </style>
      </head>
      <body>
        <canvas id="canvas"></canvas>
        <div class="vignette"></div>
        <div class="grain"></div>
        <div class="ground-shadow"></div>
        
        <script>
          const canvas = document.getElementById('canvas');
          const ctx = canvas.getContext('2d');
          let animationFrameId;
          let startTime = null;
          let hasFinished = false;

          const THEME = {
            bg: '#000000',
            redCore: '#E50914',
            redBright: '#FF1F2F',
            redDeep: '#68040a',
            redHighlight: '#ff3344'
          };

          const DURATION = {
            build: 1000,
            hold: 200,
            zoom: 2000,
            total: 4500
          };

          const LOGO = { w: 160, h: 260, p: 48 };

          const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
          const easeInQuart = (t) => t * t * t * t;

          const createThreads = () => {
            return Array.from({ length: 70 }, () => ({
              xOffset: (Math.random() - 0.5) * LOGO.w * 2,
              yOffset: (Math.random() - 0.5) * LOGO.h * 1.5,
              z: Math.random() * 2000,
              speed: 15 + Math.random() * 35,
              width: 1 + Math.random() * 3,
              color: Math.random() > 0.85 ? '#ffffff' : (Math.random() > 0.5 ? THEME.redBright : THEME.redCore)
            }));
          };

          let threads = createThreads();

          const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
          };
          window.addEventListener('resize', resize);
          resize();

          const draw = (now) => {
            if (!startTime) startTime = now;
            let elapsed = now - startTime;

            if (elapsed > DURATION.total) {
              if (!hasFinished) {
                hasFinished = true;
                if (window.ReactNativeWebView) {
                  window.ReactNativeWebView.postMessage('finished');
                }
              }
              startTime = now;
              elapsed = 0;
              threads = createThreads();
            }

            const cx = canvas.width / 2;
            const cy = canvas.height / 2;

            ctx.fillStyle = THEME.bg;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const buildProgRaw = Math.min(elapsed / DURATION.build, 1);
            const buildProg = easeOutCubic(buildProgRaw);
            
            const zoomStart = DURATION.build + DURATION.hold;
            const zoomProgRaw = Math.max(0, Math.min((elapsed - zoomStart) / DURATION.zoom, 1));
            const zoomEase = easeInQuart(zoomProgRaw);
            
            const scale = 1 / Math.max(0.001, 1 - zoomEase);
            const opacity = zoomProgRaw < 0.2 ? 1 : Math.max(0, 1 - (zoomProgRaw - 0.2) * 2);

            if (opacity > 0) {
              ctx.save();
              ctx.translate(cx, cy);
              ctx.scale(scale, scale);
              ctx.globalAlpha = opacity;

              if (zoomProgRaw > 0.3) {
                 ctx.shadowBlur = 20 * zoomProgRaw;
                 ctx.shadowColor = THEME.redBright;
              }

              const h = LOGO.h * buildProg;
              const leftX = -LOGO.w / 2;
              const rightX = LOGO.w / 2 - LOGO.p;
              const topY = -LOGO.h / 2;

              const drawTexturedPillar = (x, y, w, ph, isDark) => {
                ctx.save();
                const g = ctx.createLinearGradient(x, y, x + w, y);
                g.addColorStop(0, isDark ? THEME.redDeep : '#b00710');
                g.addColorStop(0.5, THEME.redBright);
                g.addColorStop(1, isDark ? THEME.redDeep : '#b00710');
                ctx.fillStyle = g;
                ctx.fillRect(x, y + (LOGO.h - ph), w, ph);
                
                ctx.globalAlpha = 0.15 + (zoomProgRaw * 0.3);
                ctx.fillStyle = '#000000';
                for(let i = 0; i < w; i += 3) {
                  ctx.fillRect(x + i, y + (LOGO.h - ph), 1, ph);
                }
                ctx.restore();
              };

              drawTexturedPillar(leftX, topY, LOGO.p, h, true);
              drawTexturedPillar(rightX, topY, LOGO.p, h, true);

              if (buildProgRaw > 0.3) {
                const dProg = Math.min((buildProgRaw - 0.3) * 1.5, 1);
                const currentH = LOGO.h * dProg;
                
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(leftX, topY);
                ctx.lineTo(leftX + LOGO.p, topY);
                const targetX = leftX + (LOGO.w - LOGO.p) * dProg;
                const targetY = topY + currentH;
                ctx.lineTo(targetX + LOGO.p, targetY);
                ctx.lineTo(targetX, targetY);
                ctx.closePath();
                
                const diagGrad = ctx.createLinearGradient(leftX, topY, targetX, targetY);
                diagGrad.addColorStop(0, THEME.redHighlight);
                diagGrad.addColorStop(1, THEME.redDeep);
                ctx.fillStyle = diagGrad;
                ctx.fill();

                ctx.clip();
                ctx.globalAlpha = 0.2;
                ctx.fillStyle = '#000000';
                for(let i = -LOGO.w; i < LOGO.w; i += 4) {
                   ctx.fillRect(leftX + i, topY, 1, LOGO.h);
                }
                ctx.restore();
              }
              ctx.restore();
            }

            if (zoomProgRaw > 0.1) {
              ctx.save();
              ctx.translate(cx, cy);
              
              threads.forEach(t => {
                t.z -= t.speed * (1 + zoomEase * 20);
                if (t.z <= 0) t.z = 2000;

                const pScale = 800 / t.z;
                const tx = t.xOffset * pScale;
                
                let tOpacity = Math.min(1, (2000 - t.z) / 500) * (1 - zoomProgRaw);
                if (t.z < 200) tOpacity *= (t.z / 200);

                ctx.globalAlpha = Math.max(0, tOpacity);
                ctx.fillStyle = t.color;
                const thickness = t.width * pScale;
                ctx.fillRect(tx - thickness/2, -canvas.height, thickness, canvas.height * 2);
              });
              ctx.restore();
            }

            if (zoomProgRaw > 0.9) {
              const flash = (zoomProgRaw - 0.9) * 10;
              ctx.fillStyle = \`rgba(255, 255, 255, \${flash * 0.2})\`;
              ctx.fillRect(0, 0, canvas.width, canvas.height);
            }

            animationFrameId = requestAnimationFrame(draw);
          };

          animationFrameId = requestAnimationFrame(draw);
        </script>
      </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      <WebView
        source={{ html: htmlContent }}
        style={styles.webview}
        scrollEnabled={false}
        bounces={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onMessage={(event) => {
          if (event.nativeEvent.data === 'finished' && onFinish) {
            onFinish();
          }
        }}
      />
    </View>
  );
}

export default SplashAnimation;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    zIndex: 99999,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
