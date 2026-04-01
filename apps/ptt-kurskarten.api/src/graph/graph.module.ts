import { Module } from '@nestjs/common';
import { GraphController } from './graph.controller';
import { GRAPH_REPOSITORY } from './graph.repository';
import { InMemoryGraphRepository } from './in-memory-graph.repository';
import { GraphDbGraphRepository } from './graph-db-graph.repository';
import { JsonV2GraphRepository } from './repository/json-v2-graph.repository';

@Module({
  controllers: [GraphController],
  providers: [
    GraphDbGraphRepository,
    {
      provide: GRAPH_REPOSITORY,
      useFactory: () => {
        const repo = (process.env.GRAPH_REPO ?? 'json').toLowerCase();
        if (repo === 'memory') {
          return new InMemoryGraphRepository();
        }
        return new JsonV2GraphRepository();
      },
    },
  ],
})
export class GraphModule {}
