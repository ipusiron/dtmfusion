/* DTMFusion - MIT (c) 2026 IPUSIRON. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DTMFMessages = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  return {
    ja: {
      tagline: '鳴らす。透かして見る。音から戻す。',
      intro: '押したキーは、低い音と高い音の和。電話の信号を、回路と波形から読み解きます。',
      theme: '明暗を切り替える', language: 'Switch to English', help: '使い方', close: '閉じる',
      before: '始める前に', caution: '端末の音量を小さくしてから鳴らしてください。周りの人やペットにも配慮してください。',
      keypad: '01 / キーから信号へ', scope: '02 / 波形とスペクトル', decode: '03 / 音から番号へ',
      learn: '04 / しくみを読む', helpBody: 'キーを押している間だけ2つの音が鳴ります。回路の経路を見て、音から番号を戻します。',
      privacy: '音声は外へ送らず、録音・自動保存しません。保存する設定は言語と明暗だけです。',
      author: '作者IPUSIRONはセキュリティ分野の技術書の著者です。作者は悪用を勧めません。',
      ready: '準備完了', skeleton: '計算部と画面の準備ができました。'
    },
    en: {
      tagline: 'Play it. See through it. Decode it.',
      intro: 'Every key is a low tone plus a high tone. Read a telephone signal through its circuit and waveform.',
      theme: 'Toggle light and dark', language: '日本語に切り替える', help: 'Help', close: 'Close',
      before: 'Before you begin', caution: 'Lower your device volume before playing. Consider people and pets nearby.',
      keypad: '01 / From key to signal', scope: '02 / Waveform and spectrum', decode: '03 / From sound to digits',
      learn: '04 / Explore the principles', helpBody: 'Hold a key to play two tones. Follow the circuit, then recover the key from sound.',
      privacy: 'Audio stays on this device. No recording or automatic saving. Only language and theme preferences are stored.',
      author: 'IPUSIRON writes technical books on security. The author does not encourage misuse.',
      ready: 'Ready', skeleton: 'The calculation core and page shell are ready.'
    }
  };
}));
