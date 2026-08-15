/** Simple stroke icons (no icon library). All 24×24 viewBox, currentColor. */
interface IconProps {
  size?: number;
}

function svg(paths: React.ReactNode, size = 18) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths}
    </svg>
  );
}

export const FolderIcon = ({ size }: IconProps) =>
  svg(
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
    size,
  );

export const MoveIcon = ({ size }: IconProps) =>
  svg(
    <>
      <polyline points="5 9 2 12 5 15" />
      <polyline points="9 5 12 2 15 5" />
      <polyline points="15 19 12 22 9 19" />
      <polyline points="19 9 22 12 19 15" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="12" y1="2" x2="12" y2="22" />
    </>,
    size,
  );

export const RulerIcon = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z" />
      <path d="m14.5 12.5 2-2" />
      <path d="m11.5 9.5 2-2" />
      <path d="m8.5 6.5 2-2" />
      <path d="m17.5 15.5 2-2" />
    </>,
    size,
  );

export const MeasureIcon = ({ size }: IconProps) =>
  svg(
    <>
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="9" x2="3" y2="15" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <line x1="21" y1="9" x2="21" y2="15" />
    </>,
    size,
  );

export const ZoomInIcon = ({ size }: IconProps) =>
  svg(
    <>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </>,
    size,
  );

export const ZoomOutIcon = ({ size }: IconProps) =>
  svg(
    <>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </>,
    size,
  );

export const FitIcon = ({ size }: IconProps) =>
  svg(
    <>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </>,
    size,
  );

export const SunIcon = ({ size }: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="4.9" y1="4.9" x2="6.3" y2="6.3" />
      <line x1="17.7" y1="17.7" x2="19.1" y2="19.1" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="22" y2="12" />
      <line x1="4.9" y1="19.1" x2="6.3" y2="17.7" />
      <line x1="17.7" y1="6.3" x2="19.1" y2="4.9" />
    </>,
    size,
  );

export const MoonIcon = ({ size }: IconProps) =>
  svg(<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />, size);

export const QuestionIcon = ({ size }: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </>,
    size,
  );

export const ChevronLeftIcon = ({ size }: IconProps) =>
  svg(<polyline points="15 18 9 12 15 6" />, size);

export const ChevronRightIcon = ({ size }: IconProps) =>
  svg(<polyline points="9 18 15 12 9 6" />, size);

export const AreaIcon = ({ size }: IconProps) =>
  svg(
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 15c3-2 5 1 8-1s5 1 8-1v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="currentColor" stroke="none" />
    </>,
    size,
  );

export const ListIcon = ({ size }: IconProps) =>
  svg(
    <>
      <line x1="9" y1="6" x2="21" y2="6" />
      <line x1="9" y1="12" x2="21" y2="12" />
      <line x1="9" y1="18" x2="21" y2="18" />
      <circle cx="4.5" cy="6" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1.3" fill="currentColor" stroke="none" />
    </>,
    size,
  );
