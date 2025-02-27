import { Component, Input, TemplateRef, ViewChild, OnInit, NgZone } from '@angular/core';

import { BaseComponent } from './base.component';
import { AppService } from './app.service';
import { Openorder } from './openorder';
import { OpenordersService } from './openorders.service';
import { BreakpointService } from './breakpoint.service';
import * as math from 'mathjs';
import { PricingService } from './pricing.service';
import { Pricing } from './pricing';
import * as OrderStates from '../orderstates';

math.config({
  number: 'BigNumber',
  precision: 64
});

@Component({
  selector: 'app-openorders',
  templateUrl: './openorders.component.html',
  styleUrls: ['./open-orders.component.scss']
})
export class OpenordersComponent extends BaseComponent implements OnInit {
  OrderStates: typeof OrderStates = OrderStates;

  public openorders: Openorder[];
  public selectable: boolean;
  public pricing: Pricing;
  public pricingEnabled = false;
  public pricingAvailable = false;
  public longestTokenLength: number;

  private _hashPadToken = {};
  public get hashPadToken(): object { return this._hashPadToken; }

  private _symbols: string[] = [];
  public get symbols(): string[] { return this._symbols; }
  public set symbols(val:string[]) {
    this._symbols = val;
  }

  constructor(
    private appService: AppService,
    private openorderService: OpenordersService,
    private breakpointService: BreakpointService,
    private pricingService: PricingService,
    private zone: NgZone
  ) { super(); }

  ngOnInit() {

    this.appService.marketPairChanges
      .takeUntil(this.$destroy)
      .subscribe((symbols) => {
        this.zone.run(() => {
          if (symbols)
            this.symbols = symbols;
          this.updatePricingAvailable(this.pricing ? this.pricing.enabled : false);
        });
      });

    this.openorderService.getOpenorders()
      .takeUntil(this.$destroy)
      .subscribe(openorders => {
        this.zone.run(() => {
          const orders = openorders
            .filter(o => o.status !== OrderStates.Finished &&
                        o.status !== OrderStates.Canceled &&
                        o.status !== OrderStates.Expired &&
                        o.status !== OrderStates.Offline &&
                        o.status !== OrderStates.Invalid &&
                        o.status !== OrderStates.RolledBack)
            .map((o) => {
              o['row_class'] = o.side;
              return o;
            });
          this.openorders = orders;
          const tokens = openorders
            .reduce((arr, o) => {
              return [...arr, o.maker, o.taker];
            }, [])
            .sort((a, b) => a.length === b.length ? 0 : a.length > b.length ? -1 : 1);
          this.longestTokenLength = tokens.length > 0 ? tokens[0].length : 0;
          // Calc padding
          orders.forEach(order => {
            this._hashPadToken[order.maker] = this.padToken(order.maker);
            this._hashPadToken[order.taker] = this.padToken(order.taker);
          });
        });
      });

    this.breakpointService.breakpointChanges.first()
      .takeUntil(this.$destroy)
      .subscribe((bp) => {
        this.zone.run(() => {
          this.selectable = ['xs', 'sm'].includes(bp);
        });
      });

    this.pricingService.getPricing()
      .takeUntil(this.$destroy)
      .subscribe(pricing => {
        this.zone.run(() => {
          this.pricing = pricing;
          this.updatePricingAvailable(pricing.enabled);
        });
      });
    this.pricingService.getPricingEnabled()
      .takeUntil(this.$destroy)
      .subscribe(enabled => {
        this.zone.run(() => {
          this.pricingEnabled = enabled;
        });
      });

  }

  updatePricingAvailable(enabled: boolean) {
    this.pricingAvailable = enabled;
    if (this.openorders && this.openorders.length > 0 && this.pricing)
      this.openorders.forEach(order => {
        order.updatePricingAvailable(enabled, this.pricing);
      });
  }

  cancelOrder(order) {
    const { electron } = window;
    order.canceled = true;
    order['row_class'] = 'canceled';
    electron.ipcRenderer
      .send('cancelOrder', order.id);
  }

  padToken(token) {
    const diff = this.longestTokenLength - token.length;
    for(let i = 0; i < diff; i++) {
      token += ' ';
    }
    return token;
  }

  onRowContextMenu({ row, clientX, clientY }) {

    const order = row;

    const { Menu } = window.electron.remote;
    const { clipboard, ipcRenderer } = window.electron;

    const menuTemplate = [];

    if (order.cancelable) {
      menuTemplate.push({
        label: 'Cancel Order',
        click: () => {
          const confirmed = confirm('Are you sure that you want to cancel this order?');
          if(confirmed) this.cancelOrder(order);
        }
      });
    }

    const { symbols } = this;
    const { maker, taker } = order;

    if(!symbols.includes(maker) || !symbols.includes(taker)) {
      menuTemplate.push({
        label: 'View Market',
        click: () => {
          ipcRenderer.send('setKeyPair', [maker, taker]);
        }
      });
    }

    menuTemplate.push({
      label: 'View Details',
      click: () => {
        ipcRenderer.send('openMyOrderDetailsWindow', order.id);
      }
    });

    const menu = Menu.buildFromTemplate(menuTemplate);
    menu.popup({x: clientX, y: clientY});
  }

  // getStatusDotColor(status) {
  //   if([OrderStates.New].includes(status)) {
  //     return '#888';
  //   } else if([OrderStates.Accepting, OrderStates.Hold, OrderStates.Initialized,
  //     OrderStates.Created, OrderStates.Committed].includes(status)) {
  //     return '#ff0';
  //   } else if([OrderStates.Finished].includes(status)) {
  //     return '#0f0';
  //   } else if([OrderStates.Expired, OrderStates.Offline, OrderStates.Invalid,
  //     OrderStates.RolledBack].includes(status)) {
  //     return '#c00';
  //   } else if([OrderStates.RollbackFailed].includes(status)) {
  //     return '#ea00ff';
  //   } else if([OrderStates.Canceled].includes(status)) {
  //     return '#000';
  //   } else { // open
  //     return '#fff';
  //   }
  // }

}
