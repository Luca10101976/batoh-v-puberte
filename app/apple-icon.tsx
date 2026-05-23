import { ImageResponse } from 'next/og';

export const size = {
  width: 180,
  height: 180
};

export const contentType = 'image/png';

function AppleIconArt() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(160deg, #07111f 0%, #173657 100%)',
        position: 'relative'
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: 114,
          height: 114,
          borderRadius: '999px',
          background: 'linear-gradient(180deg, #9BEA3F 0%, #63BF20 100%)',
          border: '6px solid #111111',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -30,
            left: 22,
            width: 8,
            height: 34,
            background: '#111111',
            borderRadius: 999,
            transform: 'rotate(-34deg)'
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: -32,
            left: 50,
            width: 8,
            height: 36,
            background: '#111111',
            borderRadius: 999
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: -30,
            right: 22,
            width: 8,
            height: 34,
            background: '#111111',
            borderRadius: 999,
            transform: 'rotate(34deg)'
          }}
        />
        {[
          { left: 15, top: -41 },
          { left: 47, top: -45 },
          { right: 15, top: -41 }
        ].map((dot, index) => (
          <div
            key={index}
            style={{
              position: 'absolute',
              width: 16,
              height: 16,
              borderRadius: '999px',
              background: '#111111',
              border: '3px solid #9BEA3F',
              ...dot
            }}
          />
        ))}
        <div
          style={{
            width: 50,
            height: 56,
            borderRadius: '999px',
            background: '#FFFFFF',
            border: '6px solid #111111',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: 'translateY(-4px)'
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '999px',
              background: '#111111',
              position: 'relative',
              display: 'flex'
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 5,
                left: 15,
                width: 8,
                height: 8,
                borderRadius: '999px',
                background: '#FFFFFF'
              }}
            />
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 20,
            width: 8,
            height: 8,
            borderRadius: '999px',
            background: '#111111'
          }}
        />
      </div>
    </div>
  );
}

export default function AppleIcon() {
  return new ImageResponse(<AppleIconArt />, size);
}
