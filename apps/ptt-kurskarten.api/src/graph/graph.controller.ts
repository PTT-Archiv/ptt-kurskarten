import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Post, Put, Query } from '@nestjs/common';
import type {
  ConnectionOption,
  EditionEntry,
  EdgeTimetableReport,
  GraphAssertion,
  GraphEdge,
  GraphNode,
  GraphNodePatch,
  GraphSnapshot,
  NodeDetail,
  StationProfileReport,
  TimeHHMM
} from '@ptt-kurskarten/shared';
import { GRAPH_REPOSITORY, type GraphRepository } from './graph.repository';
import { computeConnections } from './routing';
import { buildEdgeTimetable, buildStationProfile } from './reporting';

type PlaceSearchResult = {
  id: string;
  name: string;
  x: number;
  y: number;
  active: boolean;
  hidden: boolean;
};

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

  @Get('editions')
  async getEditions(): Promise<EditionEntry[]> {
    return this.graphRepository.getEditions();
  }

  @Get('place-aliases')
  async getPlaceAliases(@Query('year') year?: string): Promise<Record<string, string[]>> {
    const parsedYear = Number(year);
    const targetYear = Number.isFinite(parsedYear) ? parsedYear : 1852;
    return this.graphRepository.getNodeAliases(targetYear);
  }

  @Get('places/search')
  async searchPlaces(@Query('q') query?: string, @Query('year') year?: string): Promise<PlaceSearchResult[]> {
    const cleaned = (query ?? '').trim();
    if (cleaned.length < 2) {
      return [];
    }
    const parsedYear = Number(year);
    const targetYear = Number.isFinite(parsedYear) ? parsedYear : 1852;
    const [allNodes, snapshot] = await Promise.all([
      this.graphRepository.getAllNodes(),
      this.graphRepository.getGraphSnapshot(targetYear)
    ]);
    const visibleNodeIds = new Set(snapshot.nodes.map((node) => node.id));
    const needle = cleaned.toLowerCase();

    return allNodes
      .filter((node) => node.name.toLowerCase().includes(needle))
      .map((node) => {
        const active = this.isNodeActive(node, targetYear);
        const visible = visibleNodeIds.has(node.id);
        return {
          id: node.id,
          name: node.name,
          x: node.x,
          y: node.y,
          active,
          hidden: active && !visible
        } satisfies PlaceSearchResult;
      })
      .sort((a, b) => {
        const aExact = a.name.toLowerCase() === needle ? 1 : 0;
        const bExact = b.name.toLowerCase() === needle ? 1 : 0;
        if (aExact !== bExact) {
          return bExact - aExact;
        }
        if (a.hidden !== b.hidden) {
          return Number(a.hidden) - Number(b.hidden);
        }
        if (a.active !== b.active) {
          return Number(b.active) - Number(a.active);
        }
        return a.name.localeCompare(b.name);
      })
      .slice(0, 12);
  }

  @Get('assertions')
  async getAssertions(
    @Query('year') year?: string,
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string
  ): Promise<GraphAssertion[]> {
    const parsedYear = Number(year);
    return this.graphRepository.getAssertions({
      year: Number.isFinite(parsedYear) ? parsedYear : undefined,
      targetType: targetType?.trim() || undefined,
      targetId: targetId?.trim() || undefined
    });
  }

  @Post('assertions')
  async createAssertion(@Body() body: GraphAssertion): Promise<GraphAssertion> {
    if (!body?.targetType || !body?.targetId || !body?.schemaKey) {
      throw new BadRequestException('targetType, targetId and schemaKey are required');
    }
    return this.graphRepository.createAssertion(body);
  }

  @Put('assertions/:id')
  async updateAssertion(@Param('id') assertionId: string, @Body() body: Partial<GraphAssertion>): Promise<GraphAssertion> {
    const updated = await this.graphRepository.updateAssertion(assertionId, body);
    if (!updated) {
      throw new BadRequestException(`Assertion not found: ${assertionId}`);
    }
    return updated;
  }

  @Delete('assertions/:id')
  async deleteAssertion(@Param('id') assertionId: string): Promise<{ deleted: boolean }> {
    const deleted = await this.graphRepository.deleteAssertion(assertionId);
    return { deleted };
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
  async updateNode(@Param('id') nodeId: string, @Body() body: GraphNodePatch): Promise<GraphNode> {
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

  @Put('nodes/:id/visibility')
  async updateNodeVisibility(
    @Param('id') nodeId: string,
    @Query('year') year: string,
    @Body() body: { hidden?: boolean }
  ): Promise<{ updated: boolean; id: string; year: number; hidden: boolean }> {
    const parsedYear = Number(year);
    if (!Number.isFinite(parsedYear)) {
      throw new BadRequestException('year query parameter is required');
    }
    const hidden = body.hidden === true;
    const updated = await this.graphRepository.setNodeHidden(nodeId, parsedYear, hidden);
    return {
      updated,
      id: nodeId,
      year: parsedYear,
      hidden
    };
  }

  @Put('editions/:year')
  async updateEdition(@Param('year') year: string, @Body() body: Partial<EditionEntry>): Promise<EditionEntry> {
    const parsedYear = Number(year);
    const targetYear = Number.isFinite(parsedYear) ? parsedYear : 1852;
    return this.graphRepository.updateEdition(targetYear, body);
  }

  @Delete('nodes/:id')
  async deleteNode(@Param('id') nodeId: string, @Query('year') year?: string): Promise<{ deleted: boolean }> {
    const parsedYear = Number(year);
    const targetYear = Number.isFinite(parsedYear) ? parsedYear : undefined;
    const deleted = await this.graphRepository.deleteNode(nodeId, targetYear);
    return { deleted };
  }

  @Post('edges')
  async createEdge(@Body() body: GraphEdge): Promise<GraphEdge> {
    await this.assertEdgeNodeIds(body.from, body.to);
    const edge: GraphEdge = {
      ...body,
      id: body.id ?? `edge-${Date.now()}`,
      validFrom: body.validFrom ?? 1852,
      validTo: undefined,
      distance: body.distance ?? (body as GraphEdge & { leuge?: number }).leuge,
      trips: body.trips ?? []
    };

    return this.graphRepository.createEdge(edge);
  }

  @Put('edges/:id')
  async updateEdge(@Param('id') edgeId: string, @Body() body: Partial<GraphEdge>): Promise<GraphEdge> {
    if (body.from || body.to) {
      await this.assertEdgeNodeIds(body.from, body.to);
    }
    const patch: Partial<GraphEdge> = {
      ...body,
      distance: body.distance ?? (body as GraphEdge & { leuge?: number }).leuge
    };
    const updated = await this.graphRepository.updateEdge(edgeId, patch);
    if (!updated) {
      return {
        id: edgeId,
        from: patch.from ?? '',
        to: patch.to ?? '',
        distance: patch.distance,
        validFrom: patch.validFrom ?? 1852,
        validTo: undefined,
        trips: patch.trips ?? []
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

  private isNodeActive(node: GraphNode, year: number): boolean {
    return node.validFrom <= year && (node.validTo === undefined || year <= node.validTo);
  }
}
