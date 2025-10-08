export default function Head() {
  return (
    <>
      <title>20475 project. </title>
      <meta name="description" content="Loving you makes me happy" />
      <meta name="robots" content="noindex, nofollow" /> {/* 검색엔진 차단용 */}

      {/* Open Graph (SNS 미리보기용) */}
      <meta property="og:title" content="20475 project. " />
      <meta property="og:description" content="Loving you makes me happy" />
      <meta property="og:image" content="https://20475.vercel.app/og-image.png" />
      <meta property="og:url" content="https://20475.vercel.app" />
      <meta property="og:type" content="website" />

      <link rel="icon" href="/favicon.ico" />
    </>
  );
}