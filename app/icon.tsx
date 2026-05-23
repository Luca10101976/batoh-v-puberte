import { ImageResponse } from 'next/og';

export const size = {
  width: 512,
  height: 512
};

export const contentType = 'image/png';

function IconArt({ padded = false }: { padded?: boolean }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(160deg, #07111f 0%, #173657 100%)',
        padding: padded ? 40 : 24,
        position: 'relative'
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: 340,
          height: 340,
          borderRadius: '999px',
          background: 'linear-gradient(180deg, #9BEA3F 0%, #63BF20 100%)',
          border: '18px solid #111111',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -88,
            left: 72,
            width: 24,
            height: 92,
            background: '#111111',
            borderRadius: 999,
            transform: 'rotate(-34deg)'
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: -88,
            left: 156,
            width: 24,
            height: 92,
            background: '#111111',
            borderRadius: 999
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: -88,
            right: 72,
            width: 24,
            height: 92,
            background: '#111111',
            borderRadius: 999,
            transform: 'rotate(34deg)'
          }}
        />

        {[
          { left: 48, top: -108 },
          { left: 148, top: -118 },
          { right: 48, top: -108 }
        ].map((dot, index) => (
          <div
            key={index}
            style={{
              position: 'absolute',
              width: 46,
              height: 46,
              borderRadius: '999px',
              background: '#111111',
              border: '10px solid #9BEA3F',
              ...dot
            }}
          />
        ))}

        <div
          style={{
            width: 156,
            height: 172,
            borderRadius: '999px',
            background: '#FFFFFF',
            border: '16px solid #111111',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: 'translateY(-12px)'
          }}
        >
          <div
            style={{
              width: 82,
              height: 82,
              borderRadius: '999px',
              background: '#111111',
              position: 'relative',
              display: 'flex'
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 16,
                left: 44,
                width: 24,
                height: 24,
                borderRadius: '999px',
                background: '#FFFFFF'
              }}
            />
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 64,
            width: 20,
            height: 20,
            borderRadius: '999px',
            background: '#111111'
          }}
        />
      </div>
    </div>
  );
}

export default function Icon() {
  return new ImageResponse(<IconArt />, size);
}
