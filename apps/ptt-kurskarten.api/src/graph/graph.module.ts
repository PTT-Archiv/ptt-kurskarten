import { Module } from '@nestjs/common';
import { GraphController } from './graph.controller';
import { GRAPH_REPOSITORY } from './graph.repository';
import { InMemoryGraphRepository } from './in-memory-graph.repository';
import { GraphDbGraphRepository } from './graph-db-graph.repository';

@Module({
  controllers: [GraphController],
  providers: [
    GraphDbGraphRepository,
    {
      provide: GRAPH_REPOSITORY,
      useClass: InMemoryGraphRepository
    }
  ]
})
export class GraphModule {}
