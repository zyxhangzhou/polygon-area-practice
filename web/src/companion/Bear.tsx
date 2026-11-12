import './companion.css';

export type Mood = 'idle' | 'happy' | 'proud' | 'think' | 'cheer';

const LABELS: Record<Mood, string> = {
  idle: '圆圆',
  happy: '圆圆：开心',
  proud: '圆圆：竖起大拇指',
  think: '圆圆：歪头思考',
  cheer: '圆圆：举手庆祝',
};

const INK = '#26303A';
const FUR = '#C99A70';
const FUR_DARK = '#B98763';

/** 小熊向导圆圆（design D4，照视觉稿移植）：表情靠眼睛和嘴的图形切换 */
export function Bear({ mood = 'idle', className }: { mood?: Mood; className?: string }) {
  const happyEyes = mood === 'happy' || mood === 'proud' || mood === 'cheer';
  const think = mood === 'think';
  const d = think ? -3 : 0;
  const tilt = think ? -9 : mood === 'cheer' ? 4 : 0;
  return (
    <svg
      viewBox="0 0 200 200"
      role="img"
      aria-label={LABELS[mood]}
      className={`bear ${mood} ${className ?? ''}`}
      data-mood={mood}
    >
      <ellipse cx={100} cy={190} rx={54} ry={6} fill={INK} opacity={0.08} />
      <g className="bear-body">
        {mood === 'cheer' && (
          <g className="bear-arms">
            <ellipse
              cx={48}
              cy={122}
              rx={12}
              ry={20}
              fill={FUR_DARK}
              transform="rotate(-28 48 122)"
            />
            <ellipse
              cx={152}
              cy={122}
              rx={12}
              ry={20}
              fill={FUR_DARK}
              transform="rotate(28 152 122)"
            />
          </g>
        )}
        <path d="M50 192 Q50 140 100 137 Q150 140 150 192 Z" fill={FUR_DARK} />
        <ellipse cx={100} cy={172} rx={27} ry={19} fill="#EAD3B5" />
        <path d="M58 150 Q100 166 142 150 L142 161 Q100 177 58 161 Z" fill="#E7C98F" />
        <g stroke="#A6814A" strokeWidth={1.6} strokeLinecap="round">
          {[
            [70, 157, 162],
            [80, 160, 164],
            [90, 162, 167],
            [100, 163, 167],
            [110, 162, 167],
            [120, 160, 164],
            [130, 157, 162],
          ].map(([x, y1, y2]) => (
            <line key={x} x1={x} y1={y1} x2={x} y2={y2} />
          ))}
        </g>
        <circle cx={138} cy={172} r={13} fill="#F0B33F" />
        <circle cx={138} cy={172} r={5.5} fill="#FFFDF8" stroke="#C68F26" strokeWidth={1.5} />
        {mood === 'proud' && (
          <g className="bear-thumb">
            <ellipse cx={62} cy={168} rx={11} ry={13} fill="#A97A57" />
            <ellipse cx={60} cy={152} rx={5} ry={9} fill="#A97A57" />
          </g>
        )}
        <g className="bear-head" transform={`rotate(${tilt} 100 120)`}>
          <circle cx={62} cy={50} r={18} fill={FUR_DARK} />
          <circle cx={62} cy={50} r={9} fill="#E3B994" />
          <circle cx={138} cy={50} r={18} fill={FUR_DARK} />
          <circle cx={138} cy={50} r={9} fill="#E3B994" />
          <circle cx={100} cy={90} r={48} fill={FUR} />
          <ellipse cx={88} cy={74} rx={30} ry={22} fill="#D7AD84" opacity={0.55} />
          <ellipse cx={100} cy={106} rx={24} ry={17} fill="#F1DEC6" />
          <path d="M92 98 Q100 94 108 98 Q104 106 100 106 Q96 106 92 98 Z" fill="#3A2E2A" />
          <ellipse cx={70} cy={104} rx={8} ry={4.5} fill="#E58F74" opacity={0.35} />
          <ellipse cx={130} cy={104} rx={8} ry={4.5} fill="#E58F74" opacity={0.35} />
          {happyEyes ? (
            <g stroke={INK} strokeWidth={3.5} strokeLinecap="round" fill="none">
              <path d="M76 88 Q82 80 88 88" />
              <path d="M112 88 Q118 80 124 88" />
            </g>
          ) : (
            <g className="bear-eyes">
              <circle cx={82 + d} cy={86 + d} r={5.5} fill={INK} />
              <circle cx={118 + d} cy={86 + d} r={5.5} fill={INK} />
              <circle cx={84 + d} cy={84 + d} r={1.7} fill="#FFFDF8" />
              <circle cx={120 + d} cy={84 + d} r={1.7} fill="#FFFDF8" />
            </g>
          )}
          {think && (
            <path
              d="M108 72 Q118 66 128 71"
              stroke="#6E4E36"
              strokeWidth={3}
              strokeLinecap="round"
              fill="none"
            />
          )}
          {(mood === 'idle' || mood === 'proud') && (
            <path
              d="M90 114 Q100 122 110 114"
              stroke="#3A2E2A"
              strokeWidth={3}
              strokeLinecap="round"
              fill="none"
            />
          )}
          {(mood === 'happy' || mood === 'cheer') && (
            <path d="M89 113 Q100 129 111 113 Z" fill="#7A3B2E" />
          )}
          {think && (
            <path
              d="M94 117 Q101 114 108 117"
              stroke="#3A2E2A"
              strokeWidth={3}
              strokeLinecap="round"
              fill="none"
            />
          )}
        </g>
      </g>
      {mood === 'cheer' && (
        <g fill="#F0B33F" className="bear-sparkles">
          <path d="M34 34 L37 43 L46 46 L37 49 L34 58 L31 49 L22 46 L31 43 Z" />
          <path d="M168 28 L170 34 L176 36 L170 38 L168 44 L166 38 L160 36 L166 34 Z" />
          <path d="M176 92 L178 97 L183 99 L178 101 L176 106 L174 101 L169 99 L174 97 Z" />
        </g>
      )}
    </svg>
  );
}
