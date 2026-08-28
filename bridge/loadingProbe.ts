// 웹뷰에 주입해 "첫 화면이 실제로 그려진 순간"을 알아내는 스크립트.
//
// onLoadEnd(= HTML load 이벤트)는 Next.js가 번들을 실행하고 화면을 그리기 전에 끝나서,
// 그 시점에 로더를 내리면 사용자는 빈 종이색 화면을 한 번 더 본다. 반대로 FCP(first
// contentful paint)는 브라우저가 실제로 픽셀을 칠한 순간이라 로더를 내리기에 정확하다.
//
// 데이터 로딩(LIBRARY_LIST 등)까지 기다리지는 않는다 — 그 구간은 웹이 자체 스켈레톤으로
// 덮는다. 네이티브는 "네트워크 + 첫 페인트"까지만 책임진다.
export const WEBVIEW_FIRST_PAINT = 'WEBVIEW_FIRST_PAINT';

export type LoadingProbeMessage = { type: typeof WEBVIEW_FIRST_PAINT };

export const LOADING_PROBE_SCRIPT = `(function () {
  if (window.__sayitPaintProbe) return;
  window.__sayitPaintProbe = true;

  var sent = false;
  var tries = 0;
  function post() {
    if (sent) return;
    // injectedJavaScriptBeforeContentLoaded 시점엔 iOS에서 ReactNativeWebView가
    // 아직 주입되지 않았을 수 있다. 준비될 때까지 짧게 재시도한다(최대 1초).
    if (!window.ReactNativeWebView) {
      if (tries++ > 50) return;
      setTimeout(post, 20);
      return;
    }
    sent = true;
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: '${WEBVIEW_FIRST_PAINT}' }));
  }

  try {
    // buffered: true — 스크립트가 늦게 실행돼 이미 지나간 페인트도 받아 본다.
    new PerformanceObserver(function (list) {
      var entries = list.getEntries();
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].name === 'first-contentful-paint') post();
      }
    }).observe({ type: 'paint', buffered: true });
  } catch (error) {
    // paint timing이 없는 웹뷰 — 아래 load 폴백이 받는다.
  }

  // 폴백: load 이후 두 프레임이면 첫 페인트는 끝났다고 봐도 된다.
  window.addEventListener('load', function () {
    requestAnimationFrame(function () {
      requestAnimationFrame(post);
    });
  });
})();
true;`;
