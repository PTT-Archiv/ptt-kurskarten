import { Body, Controller, Get, Inject, Param, Post, Put, Query } from '@nestjs/common';
import type { ConnectionOption, GraphEdge, GraphNode, GraphSnapshot, NodeDetail, TimeHHMM } from '@ptt-kurskarten/shared';
import { GRAPH_REPOSITORY, type GraphRepository } from './graph.repository';
import { computeConnections } from './routing';

@Controller('v1')
export class GraphController {
  constructor(@Inject(GRAPH_REPOSITORY) private readonly graphRepository: GraphRepository) {}

  @Get('graph')
  async getGraph(@Query('year') year?: string): Promise<GraphSnapshot> {
    const parsedYear = Number(year);
    const targetYear = Number.isFinite(parsedYear) ? parsedYear : 1871;

    return this.graphRepository.getGraphSnapshot(targetYear);
  }

  @Get('years')
  async getYears(): Promise<number[]> {
    return this.graphRepository.getAvailableYears();
  }

  @Get('nodes/:id')
  async getNodeDetail(@Param('id') nodeId: string, @Query('year') year?: string): Promise<NodeDetail> {
    const parsedYear = Number(year);
    const targetYear = Number.isFinite(parsedYear) ? parsedYear : 1871;

    return this.graphRepository.getNodeNeighborhood(nodeId, targetYear);
  }

  @Get('connections')
  async getConnections(
    @Query('year') year: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('depart') depart: string,
    @Query('k') k?: string
  ): Promise<ConnectionOption[]> {
    const targetYear = Number(year) || 1871;
    if (!from || !to || !depart) {
      return [];
    }
    const snapshot = await this.graphRepository.getGraphSnapshot(targetYear);
    const count = k ? Number(k) : undefined;

    return computeConnections(snapshot, {
      year: targetYear,
      from,
      to,
      depart: depart as TimeHHMM,
      k: count
    });
  }

  @Post('nodes')
  async createNode(@Body() body: GraphNode): Promise<GraphNode> {
    const node: GraphNode = {
      ...body,
      id: body.id ?? `node-${Date.now()}`,
      name: body.name ?? 'Unnamed',
      validFrom: body.validFrom ?? 1871,
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
        validFrom: body.validFrom ?? 1871,
        validTo: body.validTo
      };
    }
    return updated;
  }

  @Post('edges')
  async createEdge(@Body() body: GraphEdge): Promise<GraphEdge> {
    const edge: GraphEdge = {
      ...body,
      id: body.id ?? `edge-${Date.now()}`,
      validFrom: body.validFrom ?? 1871,
      durationMinutes: body.durationMinutes ?? 60,
      trips: body.trips ?? []
    };

    return this.graphRepository.createEdge(edge);
  }

  @Put('edges/:id')
  async updateEdge(@Param('id') edgeId: string, @Body() body: Partial<GraphEdge>): Promise<GraphEdge> {
    const updated = await this.graphRepository.updateEdge(edgeId, body);
    if (!updated) {
      return {
        id: edgeId,
        from: body.from ?? '',
        to: body.to ?? '',
        transport: body.transport ?? 'coach',
        validFrom: body.validFrom ?? 1871,
        validTo: body.validTo,
        durationMinutes: body.durationMinutes ?? 60,
        trips: body.trips ?? []
      };
    }
    return updated;
  }
}
