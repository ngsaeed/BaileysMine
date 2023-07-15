import SimSpecModel from './sim-spec.model';
import NodeCache from 'node-cache';

export class StartSocketConfig {
  singleMode: boolean
  useMobile: boolean
  useStore: boolean
  doReplies: boolean
  currentSim: SimSpecModel
  logger: any
  msgRetryCounterCache: NodeCache


  constructor(singleMode: boolean, useMobile: boolean, useStore: boolean, doReplies: boolean, currentSim: SimSpecModel, logger: any, msgRetryCounterCache: any) {
    this.singleMode = singleMode;
    this.useMobile = useMobile;
    this.useStore = useStore;
    this.doReplies = doReplies;
    this.currentSim = currentSim;
    this.logger = logger;
    this.msgRetryCounterCache = msgRetryCounterCache;
  }
}
