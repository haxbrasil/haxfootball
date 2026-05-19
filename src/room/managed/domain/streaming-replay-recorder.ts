import createHaxballApi from "node-haxball";
import type { Room } from "@core/room";

const haxball = createHaxballApi();

export class StreamingReplayRecorder {
    private replay: InstanceType<typeof haxball.Replay.ReplayData> | null =
        null;
    private events: NodeHaxballReplayEvent[] = [];
    private startFrameNo = 0;
    private streaming = false;

    start(room: Room): void {
        this.stopStreaming(room);

        this.replay = new haxball.Replay.ReplayData();
        this.replay.roomData = room.copyStateForReplay();
        this.events = [];
        this.replay.events = this.events;
        this.startFrameNo = room.getCurrentFrameNo();

        const stream = room.startStreaming({
            immediate: true,
            onClientCount: () => {},
            emitData: () => {},
        });

        this.streaming = stream !== null;
        stream?.onOpen();
    }

    recordOperation(operation: RoomOperationObject): void {
        if (!this.replay) return;

        this.events.push(operation.message);
    }

    stop(room: Room): Uint8Array | null {
        this.stopStreaming(room);

        if (!this.replay) return null;

        const replay = this.replay;
        replay.totalFrames = Math.max(
            0,
            room.getCurrentFrameNo() - this.startFrameNo,
        );
        this.events.forEach((event) => {
            event.frameNo -= this.startFrameNo;
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
