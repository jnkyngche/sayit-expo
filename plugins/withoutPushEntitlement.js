const { withEntitlementsPlist } = require('expo/config-plugins');

/**
 * iOS entitlements에서 aps-environment(원격 푸시)를 걷어낸다.
 *
 * expo-notifications는 app.json의 plugins에 적지 않아도 자기 설정 플러그인을 자동 적용하며,
 * 그때 aps-environment를 박는다. 이 앱은 기기가 스스로 띄우는 로컬 알림만 쓰므로 APNs가
 * 필요 없고, 무료 개인 개발자 팀은 푸시 capability가 붙은 프로비저닝 프로파일 자체를
 * 만들지 못해 빌드가 막힌다. 유료 계정으로 바꾸더라도 쓰지 않는 capability는 심사에서
 * 설명을 요구받으므로 빼두는 편이 낫다.
 *
 * 원격 푸시를 실제로 쓰게 되는 날 이 플러그인을 지우면 된다.
 */
module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment'];
    return config;
  });
};
