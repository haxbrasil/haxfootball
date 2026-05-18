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

        const replayEvent = operation.message as { frameNo: number };
        replayEvent.frameNo = room.getCurrentFrameNo();
        this.replay.events.push(replayEvent);
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
        try {
            return haxball.Replay.writeAll(replay);
        } catch (error) {
            console.error("Failed to write HaxBall replay:", error);
            return null;
        } finally {
            this.replay = null;
        }
    }

    private stopStreaming(room: Room): void {
        if (!this.streaming) return;

        room.stopStreaming();
        this.streaming = false;
    }
}
