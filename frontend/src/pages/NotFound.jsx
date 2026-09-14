import { Link } from "react-router-dom";

export default function NotFound() {
return (
<> <style>{`
.not-found-page {
min-height: 100vh;
font-family: system-ui, sans-serif;
font-weight: 300;
font-size: 1.25rem;
color: #36393a;
display: flex;
align-items: center;
justify-content: center;
box-sizing: border-box;
padding: 20px;
}


    .not-found-main {
      width: 100%;
      max-width: 1200px;
      margin-top: 0;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
    }

    .not-found-text {
      max-width: 60%;
      margin-left: 1rem;
      margin-right: 1rem;
    }

    .not-found-text > div {
      margin-bottom: 3.25rem;
    }

    .not-found-svg {
      margin-left: 2rem;
      max-width: 100%;
      height: auto;
    }

    @keyframes not-found-eye-1 {
      0% {
        transform: translateX(0);
      }

      10%,
      50% {
        transform: translateX(-5px);
      }

      60% {
        transform: translateX(0);
      }

      100% {
        transform: translateX(0px);
      }
    }

    @keyframes not-found-eye-2 {
      0% {
        transform: translateX(0);
      }

      10%,
      50% {
        transform: translateX(5px);
      }

      60% {
        transform: translateX(0);
      }

      100% {
        transform: translateX(0px);
      }
    }

    .not-found-svg > .eye-1 {
      animation: not-found-eye-1 3s infinite;
    }

    .not-found-svg > .eye-2 {
      animation: not-found-eye-2 3s 0.6s infinite;
    }

    .not-found-title {
      font-size: 3.75rem;
      font-weight: 400;
      margin: 0 0 0.5rem;
    }

    .not-found-subtitle {
      font-size: 2rem;
      font-weight: 400;
      color: #92979b;
      margin: 0;
    }

    .not-found-description {
      margin: 0;
    }

    .not-found-button {
      display: inline-block;
      margin-top: 1.5rem;
      padding: 0.7rem 1.25rem;
      color: white;
      background: #0055dc;
      text-decoration: none;
      border-radius: 4px;
      font-size: 1rem;
      font-weight: 500;
      transition: background-color 0.2s ease;
    }

    .not-found-button:hover {
      background: #0044b3;
    }

    @media (max-width: 768px) {
      .not-found-page {
        padding: 30px 20px;
      }

      .not-found-main {
        margin-top: 0;
        flex-direction: column;
        text-align: center;
      }

      .not-found-text {
        max-width: 100%;
        margin: 0;
        order: 1;
      }

      .not-found-main > section:nth-child(2) {
        order: 2;
      }

      .not-found-svg {
        margin-left: 0;
        margin-top: 1rem;
        width: min(414px, 100%);
      }

      .not-found-text > div {
        margin-bottom: 2rem;
      }

      .not-found-title {
        font-size: 3rem;
      }

      .not-found-subtitle {
        font-size: 1.35rem;
        line-height: 1.5;
      }

      .not-found-description {
        font-size: 1rem;
        line-height: 1.6;
      }
    }

    @media (max-width: 480px) {
      .not-found-title {
        font-size: 2.6rem;
      }

      .not-found-subtitle {
        font-size: 1.15rem;
      }

      .not-found-description {
        font-size: 0.95rem;
      }
    }
  `}</style>

  <div className="not-found-page">
    <main className="not-found-main">
      <section className="not-found-text">
        <div>
          <h1 className="not-found-title">Error 404</h1>

          <h3 className="not-found-subtitle">
            We are sorry, the page you requested cannot be found.
          </h3>
        </div>

        <div>
          <p className="not-found-description">
            The URL may be misspelled or the page you're looking for is no
            longer available.
          </p>

          <Link to="/" className="not-found-button">
            Kembali ke Beranda
          </Link>
        </div>
      </section>

      <section>
        <svg
          className="not-found-svg"
          width="414"
          height="212"
          viewBox="0 0 414 212"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="404 Not Found"
          role="img"
        >
          {/* SVG dari template Anda tetap digunakan di sini */}

          <ellipse
            cx="208.5"
            cy="166.5"
            rx="174.5"
            ry="45.5"
            fill="#E2F5FA"
          />

          <path
            d="M205.516 80.2674H139.419L148.186 141.237H197.788L205.516 80.2674Z"
            fill="#C5EBF5"
            stroke="#6ECCE5"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <rect
            x="137"
            y="75"
            width="70.9351"
            height="9.39611"
            rx="2.40792"
            fill="#C5EBF5"
            stroke="#6ECCE5"
            strokeWidth="2"
          />

          <path
            d="M124.566 13.277C121.053 13.277 118.204 10.4288 118.204 6.91534C118.204 3.40191 121.053 0.553711 124.566 0.553711C128.08 0.553711 130.928 3.40191 130.928 6.91534C130.928 10.4288 128.08 13.277 124.566 13.277Z"
            fill="#0055DC"
          />

          <path
            d="M122.692 10.2347H126.402V24.0345H122.692V10.2347Z"
            fill="#0055DC"
          />

          <path
            d="M85.6775 57.6815H163.733V127.819H85.6775V57.6815Z"
            fill="#C5EBF5"
            stroke="#0055DC"
            strokeWidth="2"
          />

          <path
            d="M183.719 96.4263H179.429C179.429 96.4263 178.132 78.263 163.565 71.5752V65.4338C169.87 67.9703 182.283 75.5798 183.719 96.4263Z"
            fill="#0055DC"
          />

          <path
            d="M193.146 105.43L188.253 106.931C188.253 106.931 186.752 98.3591 181.394 99.6477C176.035 100.936 177.96 108.22 177.96 108.22H173.678C173.678 108.22 170.889 95.9857 180.537 94.0691C190.186 92.1524 193.146 105.43 193.146 105.43Z"
            fill="#0055DC"
          />

          <path
            d="M65.5132 96.4345H69.795C69.795 96.4345 71.0999 78.2712 85.6583 71.5752V65.4338C79.3537 67.9377 66.916 75.5472 65.5132 96.4345Z"
            fill="#0055DC"
          />

          <path
            d="M56.0777 105.406L60.9712 106.906C60.9712 106.906 62.472 98.3345 67.8304 99.6149C73.1888 100.895 71.2559 108.195 71.2559 108.195H75.5459C75.5459 108.195 78.3353 95.9611 68.6868 94.0445C59.0384 92.1278 56.0777 105.406 56.0777 105.406Z"
            fill="#0055DC"
          />

          <path
            d="M163.419 57.6273H85.5901C85.5901 57.6273 86.8707 20.01 124.5 20.01C162.13 20.01 163.419 57.6273 163.419 57.6273Z"
            fill="#C5EBF5"
            stroke="#0055DC"
            strokeWidth="2"
          />

          <path
            d="M139.792 48.9516C134.995 48.9516 131.106 45.0627 131.106 40.2656C131.106 35.4684 134.995 31.5795 139.792 31.5795C144.589 31.5795 148.478 35.4684 148.478 40.2656C148.478 45.0627 144.589 48.9516 139.792 48.9516Z"
            fill="white"
            stroke="#0055DC"
            strokeWidth="2"
          />

          <path
            d="M108.821 48.9516C104.024 48.9516 100.135 45.0627 100.135 40.2655C100.135 35.4684 104.024 31.5795 108.821 31.5795C113.618 31.5795 117.507 35.4684 117.507 40.2655C117.507 45.0627 113.618 48.9516 108.821 48.9516Z"
            fill="white"
            stroke="#0055DC"
            strokeWidth="2"
          />

          <path
            className="eye-1"
            d="M138.373 40.3055C138.373 41.4216 138.817 42.4921 139.606 43.2813C140.395 44.0706 141.466 44.5139 142.582 44.5139C143.697 44.5118 144.765 44.0674 145.552 43.2784C146.34 42.4894 146.782 41.4202 146.782 40.3055C146.78 39.1921 146.337 38.125 145.549 37.3378C144.762 36.5506 143.695 36.1073 142.582 36.1052C141.467 36.1052 140.398 36.5474 139.609 37.3349C138.82 38.1224 138.375 39.1907 138.373 40.3055Z"
            fill="#6ECCE5"
          />

          <path
            className="eye-1"
            d="M107.271 40.3055C107.271 41.4202 107.714 42.4894 108.501 43.2784C109.289 44.0674 110.357 44.5118 111.472 44.5139C112.588 44.5139 113.658 44.0706 114.447 43.2813C115.237 42.4921 115.68 41.4216 115.68 40.3055C115.678 39.1907 115.234 38.1224 114.445 37.3349C113.656 36.5474 112.586 36.1052 111.472 36.1052C110.358 36.1073 109.291 36.5506 108.504 37.3378C107.717 38.125 107.274 39.1921 107.271 40.3055Z"
            fill="#6ECCE5"
          />

          <path
            d="M84.8918 127.581H164.967C173.345 127.581 180.137 134.371 180.137 142.747C180.137 151.123 173.345 157.913 164.967 157.913H84.8918C76.5136 157.913 69.7218 151.123 69.7218 142.747C69.7218 134.371 76.5136 127.581 84.8918 127.581Z"
            fill="#C5EBF5"
            stroke="#0055DC"
            strokeWidth="2"
          />

          <path
            d="M103.252 71.1929H146.765V95.2437H103.252V71.1929Z"
            fill="#6ECCE5"
          />

          <path
            d="M108.366 75.635H127.238V91.1078H108.366V75.635Z"
            fill="white"
          />

          <path
            d="M119.345 49.2718C120.041 48.5443 120.865 47.9697 121.768 47.5786C122.671 47.1875 123.637 46.9869 124.612 46.9869C125.587 46.9869 126.553 47.1875 127.456 47.5786C128.359 47.9697 129.183 48.5443 129.879 49.2718"
            stroke="#0055DC"
            strokeWidth="2"
          />

          {/* Bagian kanan SVG template */}
          <path
            d="M274.751 12.7232C271.238 12.7232 268.39 9.87505 268.39 6.36162C268.39 2.8482 271.238 0 274.751 0C278.265 0 281.113 2.8482 281.113 6.36162C281.113 9.87505 278.265 12.7232 274.751 12.7232Z"
            fill="#0055DC"
          />

          <path
            d="M272.877 9.68185H276.588V23.4817H272.877V9.68185Z"
            fill="#0055DC"
          />

          <path
            d="M235.863 57.1286H313.919V127.266H235.863V57.1286Z"
            fill="#C5EBF5"
            stroke="#0055DC"
            strokeWidth="2"
          />

          <path
            d="M313.604 57.0745H235.775C235.775 57.0745 237.056 19.4572 274.686 19.4572C312.315 19.4572 313.604 57.0745 313.604 57.0745Z"
            fill="#C5EBF5"
            stroke="#0055DC"
            strokeWidth="2"
          />

          <path
            d="M259.006 48.4013C263.804 48.4013 267.692 44.5124 267.692 39.7152C267.692 34.918 263.804 31.0292 259.006 31.0292C254.209 31.0292 250.32 34.918 250.32 39.7152C250.32 44.5124 254.209 48.4013 259.006 48.4013Z"
            fill="white"
            stroke="#0055DC"
            strokeWidth="2"
          />

          <path
            d="M289.977 48.4013C294.774 48.4013 298.663 44.5124 298.663 39.7152C298.663 34.918 294.774 31.0292 289.977 31.0292C285.18 31.0292 281.291 34.918 281.291 39.7152C281.291 44.5124 285.18 48.4013 289.977 48.4013Z"
            fill="white"
            stroke="#0055DC"
            strokeWidth="2"
          />

          <path
            className="eye-2"
            d="M260.425 39.7552C260.425 40.8713 259.981 41.9418 259.192 42.731C258.403 43.5202 257.333 43.9636 256.216 43.9636C255.102 43.9615 254.033 43.5171 253.246 42.7281C252.458 41.9391 252.016 40.8699 252.016 39.7552C252.018 38.6418 252.461 37.5747 253.249 36.7875C254.036 36.0002 255.103 35.557 256.216 35.5549C257.331 35.5549 258.4 35.9971 259.189 36.7846C259.978 37.5721 260.423 38.6404 260.425 39.7552Z"
            fill="#6ECCE5"
          />

          <path
            className="eye-2"
            d="M291.527 39.7552C291.527 40.8699 291.085 41.9391 290.297 42.7281C289.51 43.5171 288.441 43.9615 287.327 43.9636C286.21 43.9636 285.14 43.5202 284.351 42.731C283.562 41.9418 283.118 40.8713 283.118 39.7552C283.12 38.6404 283.565 37.5721 284.354 36.7846C285.143 35.9971 286.212 35.5549 287.327 35.5549C288.44 35.557 289.507 36.0002 290.294 36.7875C291.082 37.5747 291.525 38.6418 291.527 39.7552Z"
            fill="#6ECCE5"
          />

          <path
            d="M235.077 127.028H315.152C323.53 127.028 330.322 133.818 330.322 142.194C330.322 150.57 323.53 157.36 315.152 157.36H235.077C226.699 157.36 219.907 150.57 219.907 142.194C219.907 133.818 226.699 127.028 235.077 127.028Z"
            fill="#C5EBF5"
            stroke="#0055DC"
            strokeWidth="2"
          />

          <path
            d="M253.437 70.6394H296.951V94.6902H253.437V70.6394Z"
            fill="#6ECCE5"
          />

          <path
            d="M258.552 75.0814H277.424V90.5542H258.552V75.0814Z"
            fill="white"
          />

          <path
            d="M269.53 48.7169C270.226 47.9894 271.05 47.4149 271.953 47.0237C272.856 46.6326 273.822 46.432 274.797 46.432C275.772 46.432 276.738 46.6326 277.641 47.0237C278.545 47.4149 279.368 47.9894 280.064 48.7169"
            stroke="#0055DC"
            strokeWidth="2"
          />

          <path
            d="M409.67 76.5789H343.573L352.34 137.548H401.942L409.67 76.5789Z"
            fill="#C5EBF5"
            stroke="#6ECCE5"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <rect
            x="341.154"
            y="71.3115"
            width="70.9351"
            height="9.39611"
            rx="2.40792"
            fill="#C5EBF5"
            stroke="#6ECCE5"
            strokeWidth="2"
          />

          <path
            d="M409.671 93.3885H343.573L352.34 154.358H401.942L409.671 93.3885Z"
            fill="#C5EBF5"
            stroke="#6ECCE5"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <path
            d="M295.581 108.36H360.026L351.478 167.805H303.116L295.581 108.36Z"
            fill="#C5EBF5"
            stroke="#0055DC"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <path
            d="M342.555 136.334H382.924L377.569 173.57H347.275L342.555 136.334Z"
            fill="#C5EBF5"
            stroke="#0055DC"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <path
            d="M17.328 102.337L6.64737 166.613L67.3531 167.939L75.3682 119.704L17.328 102.337Z"
            fill="#C5EBF5"
            stroke="#0055DC"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </section>
    </main>
  </div>
</>


);
}

