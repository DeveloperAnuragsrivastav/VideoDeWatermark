import { useRef, useState, useCallback, useEffect } from "react";
import type { WatermarkRegion } from "../App";

type Props = {
  canvasWidth: number;
  canvasHeight: number;
  videoWidth: number;
  videoHeight: number;
  region: WatermarkRegion | null;
  onRegionChange: (region: WatermarkRegion | null) => void;
};

export function SelectionCanvas({
  canvasWidth,
  canvasHeight,
  videoWidth,
  videoHeight,
  region,
  onRegionChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentPoint, setCurrentPoint] = useState<{ x: number; y: number } | null>(null);

  // Scale factors to convert canvas coords → video pixel coords
  const scaleX = videoWidth / canvasWidth;
  const scaleY = videoHeight / canvasHeight;

  // Draw the selection rectangle
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    let drawRegion: { x: number; y: number; w: number; h: number } | null = null;

    if (isDrawing && startPoint && currentPoint) {
      // While dragging, draw in canvas space
      const x = Math.min(startPoint.x, currentPoint.x);
      const y = Math.min(startPoint.y, currentPoint.y);
      const w = Math.abs(currentPoint.x - startPoint.x);
      const h = Math.abs(currentPoint.y - startPoint.y);
      drawRegion = { x, y, w, h };
    } else if (region) {
      // Committed region is in video pixel space → convert to canvas space
      drawRegion = {
        x: region.x / scaleX,
        y: region.y / scaleY,
        w: region.width / scaleX,
        h: region.height / scaleY,
      };
    }

    if (drawRegion && drawRegion.w > 2 && drawRegion.h > 2) {
      // Semi-transparent overlay outside the selection
      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      ctx.clearRect(drawRegion.x, drawRegion.y, drawRegion.w, drawRegion.h);

      // Selection border
      ctx.strokeStyle = "#dc2626";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(drawRegion.x, drawRegion.y, drawRegion.w, drawRegion.h);
      ctx.setLineDash([]);

      // Corner handles
      const handleSize = 8;
      ctx.fillStyle = "#dc2626";
      const corners = [
        [drawRegion.x, drawRegion.y],
        [drawRegion.x + drawRegion.w, drawRegion.y],
        [drawRegion.x, drawRegion.y + drawRegion.h],
        [drawRegion.x + drawRegion.w, drawRegion.y + drawRegion.h],
      ];
      for (const [cx, cy] of corners) {
        ctx.fillRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
      }

      // Dimension label
      if (region || (startPoint && currentPoint)) {
        const vw = Math.round(drawRegion.w * scaleX);
        const vh = Math.round(drawRegion.h * scaleY);
        const label = `${vw} × ${vh}`;
        ctx.font = "12px Inter, sans-serif";
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        const metrics = ctx.measureText(label);
        const labelX = drawRegion.x + drawRegion.w / 2 - metrics.width / 2 - 6;
        const labelY = drawRegion.y - 8;
        ctx.fillRect(labelX, labelY - 14, metrics.width + 12, 20);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(label, labelX + 6, labelY);
      }
    }
  }, [canvasWidth, canvasHeight, region, isDrawing, startPoint, currentPoint, scaleX, scaleY]);

  const getCanvasPos = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(canvasWidth, e.clientX - rect.left)),
        y: Math.max(0, Math.min(canvasHeight, e.clientY - rect.top)),
      };
    },
    [canvasWidth, canvasHeight]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return; // Left click only
      const pos = getCanvasPos(e);
      setIsDrawing(true);
      setStartPoint(pos);
      setCurrentPoint(pos);
      onRegionChange(null); // Clear existing region
    },
    [getCanvasPos, onRegionChange]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing) return;
      setCurrentPoint(getCanvasPos(e));
    },
    [isDrawing, getCanvasPos]
  );

  const handleMouseUp = useCallback(() => {
    if (!isDrawing || !startPoint || !currentPoint) {
      setIsDrawing(false);
      return;
    }

    // Convert canvas coords to video pixel coords
    const x = Math.round(Math.min(startPoint.x, currentPoint.x) * scaleX);
    const y = Math.round(Math.min(startPoint.y, currentPoint.y) * scaleY);
    const w = Math.round(Math.abs(currentPoint.x - startPoint.x) * scaleX);
    const h = Math.round(Math.abs(currentPoint.y - startPoint.y) * scaleY);

    if (w > 5 && h > 5) {
      onRegionChange({
        x: Math.max(0, Math.min(videoWidth - w, x)),
        y: Math.max(0, Math.min(videoHeight - h, y)),
        width: Math.min(w, videoWidth),
        height: Math.min(h, videoHeight),
      });
    }

    setIsDrawing(false);
    setStartPoint(null);
    setCurrentPoint(null);
  }, [isDrawing, startPoint, currentPoint, scaleX, scaleY, videoWidth, videoHeight, onRegionChange]);

  return (
    <canvas
      ref={canvasRef}
      className="preview-canvas"
      width={canvasWidth}
      height={canvasHeight}
      style={{ width: canvasWidth, height: canvasHeight }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
}
