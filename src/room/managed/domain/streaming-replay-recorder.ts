import createHaxballApi from "node-haxball";
import type { Room } from "@core/room";

const haxball = createHaxballApi();

export class StreamingReplayRecorder {
    private replay: InstanceType<typeof haxball.Replay.ReplayData> | null =
        null;
    private startFrameNo = 0;
    private streaming = false;

    start(room: Room): void {
        this.stopStreaming(room);

        this.replay = new haxball.Replay.ReplayData();
        this.replay.roomData = room.takeSnapshot() as never;
        this.startFrameNo = room.getCurrentFrameNo();

        const stream = room.startStreaming({
            immediate: true,
            onClientCount: () => {},
            emitData: () => {},
        });

        this.streaming = stream !== null;
        stream?.onOpen();
    }

    recordOperation(room: Room, operation: RoomOperationObject): void {
        if (!this.replay || typeof operation.message !== "object") return;
        if (operation.message === null) return;

        this.replay.events.push({
            ...(operation.message as Record<string, unknown>),
            frameNo: room.getCurrentFrameNo(),
        });
    }

    stop(room: Room): Uint8Array | null {
        this.stopStreaming(room);

        if (!this.replay) return null;

        const replay = this.replay;
        replay.totalFrames = Math.max(
            0,
            room.getCurrentFrameNo() - this.startFrameNo,
        );
        replay.events.forEach((event) => {
            const replayEvent = event as { frameNo: number };
            replayEvent.frameNo -= this.startFrameNo;
        });
        this.replay = null;

        return haxball.Replay.writeAll(replay);
    }

    private stopStreaming(room: Room): void {
        if (!this.streaming) return;

        room.stopStreaming();
        this.streaming = false;
    }
}
