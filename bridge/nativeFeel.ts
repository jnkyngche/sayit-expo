// 웹뷰에 주입해 "브라우저 냄새"를 지우는 스타일. 네이티브 prop으로 끌 수 없는 것만 여기서 다룬다.
//
// (1) 롱프레스 콜아웃: iOS는 allowsLinkPreview={false}로 링크 미리보기를 막을 수 있지만,
//     이미지를 꾹 누를 때 뜨는 메뉴("이미지 저장 / 복사 / 공유…")는 그대로 남는다. 거기서
//     공유를 누르면 페이지 주소가 딸려 나가서 웹 주소가 그대로 드러난다. 이 앱은 촬영한
//     교재 이미지를 웹 화면에 그리므로 실제로 누를 이미지가 있다.
// (2) 링크 드래그: iPad에서 링크를 끌어다 다른 앱에 떨구면 주소가 그대로 넘어간다.
//     supportsTablet이 켜져 있어 해당된다. 네이티브 prop으로는 못 끄고 CSS로만 막힌다.
// (3) 탭 하이라이트: 버튼을 누를 때마다 번쩍이는 회색/파란 사각형은 네이티브 앱에 없는 흔적이다.
//
// 텍스트 선택(user-select)은 건드리지 않는다 — 영어 문장을 복사하는 건 이 앱에서 쓸모 있는
// 동작이고, 선택 메뉴는 주소를 노출하지 않는다.
export const NATIVE_FEEL_SCRIPT = `(function () {
  if (window.__sayitNativeFeel) return;
  window.__sayitNativeFeel = true;

  function apply() {
    if (!document.head) return false;
    var style = document.createElement('style');
    style.appendChild(document.createTextNode(
      '*{-webkit-touch-callout:none;-webkit-user-drag:none;-webkit-tap-highlight-color:transparent}'
    ));
    document.head.appendChild(style);
    return true;
  }

  // 문서 끝에서 주입되므로 보통 첫 시도에 붙는다. 그보다 이르게 실행되는 경우만 폴백을 탄다.
  if (!apply()) document.addEventListener('DOMContentLoaded', apply);
})();
true;`;
