import React, { useRef, useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

interface ColorExtractorProps {
  imageUrl: string;
  onColorExtracted: (color: string) => void;
}

const hiddenStyle = StyleSheet.create({
  container: { width: 0, height: 0, opacity: 0, position: 'absolute' as const },
  webview: { width: 1, height: 1 },
});

const ColorExtractor = React.memo(({ imageUrl, onColorExtracted }: ColorExtractorProps) => {
  const lastUrlRef = useRef<string>('');
  const lastColorRef = useRef<string>('#141414');

  // Skip if same URL — return cached color immediately
  if (!imageUrl) return null;
  if (imageUrl === lastUrlRef.current) {
    // Already extracted for this URL, no need to spin up a WebView again
    return null;
  }

  const html = `
    <html>
      <head>
        <style>body { background: transparent; }</style>
      </head>
      <body>
        <canvas id="canvas" style="display:none;"></canvas>
        <script>
          const img = new Image();
          img.crossOrigin = 'Anonymous';
          img.src = '${imageUrl}';
          img.onload = function() {
            const canvas = document.getElementById('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 1;
            canvas.height = 1;
            ctx.drawImage(img, 0, 0, 1, 1);
            const data = ctx.getImageData(0, 0, 1, 1).data;
            const r = data[0];
            const g = data[1];
            const b = data[2];
            const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
            window.ReactNativeWebView.postMessage(hex);
          };
          img.onerror = function() {
            window.ReactNativeWebView.postMessage('#141414');
          };
        </script>
      </body>
    </html>
  `;

  return (
    <View style={hiddenStyle.container}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={hiddenStyle.webview}
        onMessage={(event) => {
          const color = event.nativeEvent.data;
          lastUrlRef.current = imageUrl;
          lastColorRef.current = color;
          onColorExtracted(color);
        }}
        javaScriptEnabled={true}
      />
    </View>
  );
});

export default ColorExtractor;
