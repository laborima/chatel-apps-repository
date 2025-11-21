import React from 'react';

const BASE_PATH = '/chatel-apps-repository';
const SPRITE_IMAGE = `${BASE_PATH}/icons/icon_activities.png`;

// Grid configuration based on user input: 2 rows and 3 columns
// Image dimensions: 2816x1536
const SPRITE_LAYOUT = {
  cols: 3,
  rows: 2,
};

// Mapping of activities to their grid coordinates {x, y}
// x: column index (0 to cols-1)
// y: row index (0 to rows-1)
const ICON_MAPPING = {
  sailboat: { x: 0, y: 0 },   // Row 1, Col 1
  windsurf: { x: 1, y: 0 },   // Row 1, Col 2
  wing: { x: 2, y: 0 },       // Row 1, Col 3
  speedsail: { x: 0, y: 1 },  // Row 2, Col 1
  paddle: { x: 1, y: 1 },     // Row 2, Col 2
  default: { x: 2, y: 1 },    // Row 2, Col 3
};

const ActivitySprite = ({ name, className = "w-6 h-6" }) => {
  // Debug log (can be removed later)
  console.log(`ActivityIcons: Rendering ${name}`);

  const coords = ICON_MAPPING[name] || ICON_MAPPING.default;
  const { x, y } = coords;
  const { cols, rows } = SPRITE_LAYOUT;

  // Calculate background position percentages
  // For a sprite sheet, 0% is the first item, 100% is the last item.
  // Formula: (index / (total - 1)) * 100
  const posX = (x / (cols - 1)) * 100;
  const posY = (y / (rows - 1)) * 100;
  
  return (
    <div 
      className={`${className} bg-no-repeat inline-block`}
      style={{
        backgroundImage: `url(${SPRITE_IMAGE})`,
        // Background size must be relative to the container (1 tile)
        // width: cols * 100%, height: rows * 100%
        backgroundSize: `${cols * 100}% ${rows * 100}%`,
        backgroundPosition: `${posX}% ${posY}%`
      }}
      role="img"
      aria-label={name}
    />
  );
};

export const SailboatIcon = (props) => <ActivitySprite name="sailboat" {...props} />;
export const WindsurfIcon = (props) => <ActivitySprite name="windsurf" {...props} />;
export const WingIcon = (props) => <ActivitySprite name="wing" {...props} />;
export const SpeedsailIcon = (props) => <ActivitySprite name="speedsail" {...props} />;
export const PaddleIcon = (props) => <ActivitySprite name="paddle" {...props} />;
export const DefaultWaterIcon = (props) => <ActivitySprite name="default" {...props} />;

export const getActivityIconComponent = (type, className = "w-6 h-6") => {
    switch (type) {
        case "sailboat":
        case "bateau":
            return <SailboatIcon className={className} />;
        case "windsurf":
            return <WindsurfIcon className={className} />;
        case "wing":
        case "wingfoil":
            return <WingIcon className={className} />;
        case "speedsail":
            return <SpeedsailIcon className={className} />;
        case "sup":
        case "paddle":
            return <PaddleIcon className={className} />;
        default:
            return <DefaultWaterIcon className={className} />;
    }
};
