import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getToken } from '../auth/session';

export type LivePoint = {
  vehicleId: string;
  lat: number;
  lng: number;
};

export function useVehicleTracking(vehicleId: string | null): {
  connected: boolean;
  positions: Record<string, LivePoint>;
} {
  const [connected, setConnected] = useState(false);
  const [positions, setPositions] = useState<Record<string, LivePoint>>({});
  const socketRef = useRef<Socket | null>(null);
  const vehicleIdRef = useRef(vehicleId);
  vehicleIdRef.current = vehicleId;

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setConnected(false);
      return;
    }

    const url = import.meta.env.VITE_WS_URL || 'http://localhost:3000';
    const socket = io(url, {
      path: '/realtime',
      auth: { token },
    });
    socketRef.current = socket;

    const subscribe = () => {
      const current = getToken();
      if (!current) {
        socket.disconnect();
        setConnected(false);
        return;
      }
      const id = vehicleIdRef.current;
      socket.emit('tracking:subscribe', id ? { vehicleId: id } : {});
    };

    socket.on('connect', () => {
      setConnected(true);
      subscribe();
    });
    socket.on('disconnect', () => {
      setConnected(false);
    });
    socket.on('connect_error', () => {
      setConnected(false);
    });
    socket.on('vehicle:snapshot', (rows: unknown) => {
      setPositions((current) => mergePoints(current, rows));
    });
    socket.on('vehicle:location', (row: unknown) => {
      setPositions((current) => mergePoints(current, [row]));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, []);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      return;
    }
    const token = getToken();
    if (!token) {
      socket.disconnect();
      setConnected(false);
      return;
    }
    socket.emit('tracking:subscribe', vehicleId ? { vehicleId } : {});
  }, [vehicleId]);

  return { connected, positions };
}

function mergePoints(
  current: Record<string, LivePoint>,
  rows: unknown,
): Record<string, LivePoint> {
  if (!Array.isArray(rows)) {
    return current;
  }
  const next = { ...current };
  for (const row of rows) {
    const point = readPoint(row);
    if (point) {
      next[point.vehicleId] = point;
    }
  }
  return next;
}

function readPoint(value: unknown): LivePoint | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const row = value as Partial<LivePoint>;
  if (
    typeof row.vehicleId !== 'string' ||
    typeof row.lat !== 'number' ||
    typeof row.lng !== 'number'
  ) {
    return null;
  }
  return { vehicleId: row.vehicleId, lat: row.lat, lng: row.lng };
}
