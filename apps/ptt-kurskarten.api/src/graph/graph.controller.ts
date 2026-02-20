import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Post, Put, Query } from '@nestjs/common';
import type {
  ConnectionOption,
  EdgeTimetableReport,
  GraphEdge,
  GraphNode,
  GraphSnapshot,
  NodeDetail,
  StationProfileReport,
  TimeHHMM
} from '@ptt-kurskarten/shared';
import { GRAPH_REPOSITORY, type GraphRepository } from './graph.repository';
import { computeConnections } from './routing';
import { buildEdgeTimetable, buildStationProfile } from './reporting';

@Controller('v1')
export class GraphController {
  constructor(@Inject(GRAPH_REPOSITORY) private readonly graphRepository: GraphRepository) { }

  @Get('graph')
  async getGraph(@Query('year') year?: string): Promise<GraphSnapshot> {
    const parsedYear = Number(year);
    const targetYear = Number.isFinite(parsedYear) ? parsedYear : 1852;

    return this.graphRepository.getGraphSnapshot(targetYear);
  }

  @Get('years')
  async getYears(): Promise<number[]> {
    return this.graphRepository.getAvailableYears();
  }

  @Get('nodes/:id')
  async getNodeDetail(@Param('id') nodeId: string, @Query('year') year?: string): Promise<NodeDetail> {
    const parsedYear = Number(year);
    const targetYear = Number.isFinite(parsedYear) ? parsedYear : 1852;

    return this.graphRepository.getNodeNeighborhood(nodeId, targetYear);
  }

  @Get('connections')
  async getConnections(
    @Query('year') year: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('depart') depart: string,
    @Query('k') k?: string,
    @Query('allowForeignStartFallback') allowForeignStartFallback?: string
  ): Promise<ConnectionOption[]> {
    const targetYear = Number(year) || 1852;
    if (!from || !to || !depart) {
      return [];
    }
    const snapshot = await this.graphRepository.getGraphSnapshot(targetYear);
    const count = k ? Number(k) : undefined;
    const allowFallback = allowForeignStartFallback !== 'false';

    return computeConnections(snapshot, {
      year: targetYear,
      from,
      to,
      depart: depart as TimeHHMM,
      k: count,
      allowForeignStartFallback: allowFallback
    });
  }

  @Get('report/station/:nodeId')
  async getStationReport(@Param('nodeId') nodeId: string, @Query('year') year?: string): Promise<StationProfileReport> {
    const targetYear = Number(year) || 1852;
    const snapshot = await this.graphRepository.getGraphSnapshot(targetYear);
    return buildStationProfile(snapshot, nodeId);
  }

  @Get('report/edge/:edgeId')
  async getEdgeReport(@Param('edgeId') edgeId: string, @Query('year') year?: string): Promise<EdgeTimetableReport> {
    const targetYear = Number(year) || 1852;
    const snapshot = await this.graphRepository.getGraphSnapshot(targetYear);
    return buildEdgeTimetable(snapshot, edgeId);
  }

  @Post('nodes')
  async createNode(@Body() body: GraphNode): Promise<GraphNode> {
    const node: GraphNode = {
      ...body,
      id: body.id ?? `node-${Date.now()}`,
      name: body.name ?? 'Unnamed',
      validFrom: body.validFrom ?? 1852,
      x: body.x ?? 0,
      y: body.y ?? 0
    };

    return this.graphRepository.createNode(node);
  }

  @Put('nodes/:id')
  async updateNode(@Param('id') nodeId: string, @Body() body: Partial<GraphNode>): Promise<GraphNode> {
    const updated = await this.graphRepository.updateNode(nodeId, body);
    if (!updated) {
      return {
        id: nodeId,
        name: body.name ?? 'Unknown',
        x: body.x ?? 0,
        y: body.y ?? 0,
        validFrom: body.validFrom ?? 1852,
        validTo: body.validTo
      };
    }
    return updated;
  }

  @Delete('nodes/:id')
  async deleteNode(@Param('id') nodeId: string): Promise<{ deleted: boolean }> {
    const deleted = await this.graphRepository.deleteNode(nodeId);
    return { deleted };
  }

  @Post('edges')
  async createEdge(@Body() body: GraphEdge): Promise<GraphEdge> {
    await this.assertEdgeNodeIds(body.from, body.to);
    const edge: GraphEdge = {
      ...body,
      id: body.id ?? `edge-${Date.now()}`,
      validFrom: body.validFrom ?? 1852,
      leuge: body.leuge,
      durationMinutes: body.durationMinutes ?? 60,
      trips: body.trips ?? []
    };

    return this.graphRepository.createEdge(edge);
  }

  @Put('edges/:id')
  async updateEdge(@Param('id') edgeId: string, @Body() body: Partial<GraphEdge>): Promise<GraphEdge> {
    if (body.from || body.to) {
      await this.assertEdgeNodeIds(body.from, body.to);
    }
    const updated = await this.graphRepository.updateEdge(edgeId, body);
    if (!updated) {
      return {
        id: edgeId,
        from: body.from ?? '',
        to: body.to ?? '',
        transport: body.transport ?? 'postkutsche',
        leuge: body.leuge,
        validFrom: body.validFrom ?? 1852,
        validTo: body.validTo,
        durationMinutes: body.durationMinutes ?? 60,
        trips: body.trips ?? []
      };
    }
    return updated;
  }

  @Delete('edges/:id')
  async deleteEdge(@Param('id') edgeId: string): Promise<{ deleted: boolean }> {
    const deleted = await this.graphRepository.deleteEdge(edgeId);
    return { deleted };
  }

  private async assertEdgeNodeIds(from?: string, to?: string): Promise<void> {
    const nodes = await this.graphRepository.getAllNodes();
    const nodeIds = new Set(nodes.map((node) => node.id));
    if (!from || !nodeIds.has(from)) {
      throw new BadRequestException('Invalid edge: from node id not found');
    }
    if (!to || !nodeIds.has(to)) {
      throw new BadRequestException('Invalid edge: to node id not found');
    }
  }
}
